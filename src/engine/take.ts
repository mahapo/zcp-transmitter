// The take: the utterance or recording on screen. Changing a setting renders
// its audio again as a preview, which is shown but never sent anywhere.
import { markRaw, watch } from "vue";
import { type StageId, dutyCycle } from "../dsp/chain.ts";
import { AUDIO_RATE, type ChainConfig } from "../dsp/config.ts";
import { withEnvelope } from "../dsp/spectrogram.ts";
import { signalAt } from "../dsp/stages.ts";
import { session } from "../state/session.ts";
import { type Take, signal } from "../state/signal.ts";
import { ui } from "../state/ui.ts";
import { renderDsp } from "./dspClient.ts";
import { fail } from "./status.ts";

// Up to this length every stage is kept; a longer take keeps the input and the stage in view.
const ALL_TAPS_MAX_SAMPLES = 12 * AUDIO_RATE;
const PREVIEW_DELAY_MS = 120; // lets a slider settle

/** A plain copy of the settings: the reactive ones cannot cross to a worker. */
export function currentConfig(): ChainConfig {
  return { ...session.config, filters: { ...session.config.filters } };
}

function sameConfig(a: ChainConfig, b: ChainConfig): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Runs one utterance (48 kHz) through a fresh chain, as the catalog generator
 * does. It only computes: nothing is sent, recorded or counted.
 */
export async function renderTake(audio: Float32Array, title: string): Promise<Take> {
  const config = currentConfig();
  const taps = audio.length <= ALL_TAPS_MAX_SAMPLES ? "all" : (["input", signalAt(signal.stage, config.filters)] satisfies StageId[]);
  const copy = audio.slice(); // the take keeps its samples
  const reply = await renderDsp.call({ kind: "render", audio: copy, config, spectrogram: ui.makeSpectrogram, taps }, [copy.buffer]);
  const { pulses } = reply;
  return {
    title,
    audio,
    config,
    pulses,
    pulseCount: reply.pulseCount,
    duty: dutyCycle(pulses),
    taps: new Map([...reply.taps.map((tap) => [tap.stage, tap] as const), ["pulse", { stage: "pulse", samples: pulses, skipped: audio.length - pulses.length }]]),
    agcGain: reply.agcGain,
    peaks: reply.peaks,
    spectrogram: reply.spectrogram ? withEnvelope(reply.spectrogram, pulses) : null,
    sent: false,
  };
}

let shown = 0;

export function showTake(take: Take) {
  shown++;
  signal.take = markRaw(take);
  signal.previewing = false;
}

/** Shows pulses that were recorded: a take without audio. */
export async function showRecording(pulses: Float32Array, title: string) {
  const turn = ++shown;
  try {
    const spectrogram = ui.makeSpectrogram ? (await renderDsp.call({ kind: "spectrogram", pulses })).spectrogram : null;
    if (turn !== shown) return; // something newer is on screen
    const take: Take = {
      title,
      config: currentConfig(),
      pulses,
      pulseCount: 0,
      duty: dutyCycle(pulses),
      taps: new Map([["pulse", { stage: "pulse", samples: pulses, skipped: 0 }]]),
      spectrogram: spectrogram ? withEnvelope(spectrogram, pulses) : null,
      sent: true,
    };
    signal.take = markRaw(take);
  } catch (error) {
    fail(error);
  }
}

/** Renders the take's audio again with the settings as they are now. */
async function preview() {
  const take = signal.take;
  if (!take?.audio) return;
  const turn = ++shown;
  signal.previewing = true;
  try {
    const next = await renderTake(take.audio, take.title);
    if (turn !== shown) return;
    next.sent = take.sent && sameConfig(take.config, next.config);
    signal.take = markRaw(next);
  } catch (error) {
    fail(error);
  } finally {
    if (turn === shown) signal.previewing = false;
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => [session.config, ui.makeSpectrogram],
  () => {
    clearTimeout(timer);
    timer = setTimeout(preview, PREVIEW_DELAY_MS);
  },
  { deep: true },
);

// A long take holds only the stage in view, so looking at another one needs a new render.
watch(
  () => signal.stage,
  (stage) => {
    const take = signal.take;
    if (take?.audio && !take.taps.has(signalAt(stage, take.config.filters))) void preview();
  },
);
