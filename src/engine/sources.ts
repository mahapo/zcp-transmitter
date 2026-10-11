// Audio Input: the microphone, eSpeak and audio files, each run through the chain.
import { decodeFile } from "../audio/file.ts";
import { type Mic, levelDb, startMic } from "../audio/mic.ts";
import { synthesize } from "../audio/tts.ts";
import { dutyCycle } from "../dsp/chain.ts";
import { AUDIO_RATE, type ChainConfig } from "../dsp/config.ts";
import { prepareUtterance } from "../dsp/wav.ts";
import { radio } from "../state/radio.ts";
import { session } from "../state/session.ts";
import { signal } from "../state/signal.ts";
import { ui } from "../state/ui.ts";
import { text } from "../text.ts";
import { liveDsp, renderDsp } from "./dspClient.ts";
import type { DspReply, RenderRequest } from "./protocol.ts";
import { emit, queue } from "./pulses.ts";
import { fail, say } from "./status.ts";
import { showSpectrogram } from "./view.ts";

const MAX_BACKLOG_SECONDS = 2; // of microphone pulses waiting for the transmitter

/** A plain copy of the settings: the reactive ones cannot cross to a worker. */
function currentConfig(): ChainConfig {
  return { ...session.config, filters: { ...session.config.filters } };
}

/**
 * Runs one utterance (48 kHz) through a fresh chain, as the catalog generator
 * does. It only computes: nothing is sent, recorded or counted.
 */
export function render(audio: Float32Array, spectrogram: boolean): Promise<DspReply<RenderRequest>> {
  const copy = audio.slice(); // the caller keeps its samples
  return renderDsp.call({ kind: "render", audio: copy, config: currentConfig(), spectrogram }, [copy.buffer]);
}

/** Renders an utterance and sends its pulses out. */
async function play(audio: Float32Array, title: string) {
  const { pulses, pulseCount, spectrogram } = await render(audio, ui.makeSpectrogram && !radio.recording);
  emit(pulses, pulseCount);
  if (ui.makeSpectrogram && !radio.recording) void showSpectrogram(pulses, title, spectrogram);
  say(text.status.played(title, audio.length / AUDIO_RATE, pulseCount, dutyCycle(pulses)));
}

export async function generateVoice() {
  const words = session.text.trim();
  if (!words || signal.generating) return;
  signal.generating = true;
  try {
    await play(prepareUtterance(await synthesize(words, session.voice)), text.title.utterance(words));
  } catch (error) {
    fail(error);
  } finally {
    signal.generating = false;
  }
}

export async function playFile(file: File) {
  try {
    await play(await decodeFile(await file.arrayBuffer()), file.name);
  } catch (error) {
    fail(error);
  }
}

/** The utterance the reference catalog was generated from ("Test", already padded with silence). */
export async function playReferenceSample() {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}samples/test-48k.wav`);
    await play(await decodeFile(await response.arrayBuffer()), text.title.referenceSample);
  } catch (error) {
    fail(error);
  }
}

let mic: Mic | undefined;

export async function toggleMic() {
  if (mic) {
    mic.stop();
    mic = undefined;
    signal.micOn = false;
    signal.micDb = -60;
    return;
  }
  try {
    mic = await startMic(async (samples) => {
      signal.micDb = levelDb(samples);
      const backlogged = queue.length > MAX_BACKLOG_SECONDS * AUDIO_RATE;
      const { pulses, pulseCount } = await liveDsp.call({ kind: "live", audio: samples, config: currentConfig() }, [samples.buffer]);
      if (signal.micOn && !backlogged) emit(pulses, pulseCount);
    });
    signal.micOn = true;
  } catch (error) {
    fail(new Error(text.status.microphone(error instanceof Error ? error.message : String(error))));
  }
}
