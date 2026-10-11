// Monitoring: playing the take, or the microphone's chain as it runs, over the
// loudspeaker. What is heard is the input, the stage in view or the pulses.
import { watch } from "vue";
import { type LiveMonitor, type Playback, playSamples, setVolume, startLiveMonitor } from "../audio/monitor.ts";
import { AUDIO_RATE } from "../dsp/config.ts";
import { signalAt } from "../dsp/stages.ts";
import { type Take, signal } from "../state/signal.ts";
import { ui } from "../state/ui.ts";
import type { LiveReply, Tap } from "./protocol.ts";
import { fail } from "./status.ts";

const SAMPLES_PER_MS = AUDIO_RATE / 1000;
const PULSE_LEVEL = 0.3; // pulses are clicks at full scale; this keeps them bearable
const TAP_LEVEL = 0.6; // every stage is brought to this peak, whatever its own level
const MAX_TAP_GAIN = 100;

/** What of `take` the monitor would play, and where its first sample lies on the time axis of the pulses. */
function sourceOf(take: Take): { tap: Tap; offset: number } | undefined {
  const stage = ui.monitorSource === "input" ? "input" : ui.monitorSource === "pulses" ? "pulse" : signalAt(signal.stage, take.config.filters);
  const tap = take.taps.get(stage);
  if (!tap) return undefined;
  return { tap, offset: take.audio ? tap.skipped - (take.audio.length - take.pulses.length) : 0 };
}

/** Whether the take has what the monitor is set to. */
export function canMonitor(): boolean {
  return signal.take !== null && sourceOf(signal.take) !== undefined;
}

/** `samples` at a level fit for listening: the input as it is, pulses turned down, any other stage normalised. */
function audible(samples: Float32Array, stage: string): Float32Array {
  if (stage === "input") return samples;
  if (stage === "pulse") return samples.map((value) => value * PULSE_LEVEL);
  let peak = 0;
  for (const value of samples) peak = Math.max(peak, Math.abs(value));
  const gain = peak > 0 ? Math.min(MAX_TAP_GAIN, TAP_LEVEL / peak) : 1;
  return samples.map((value) => value * gain);
}

let playback: Playback | undefined;
let frame = 0;

export function stopMonitor() {
  playback?.stop();
  playback = undefined;
  cancelAnimationFrame(frame);
  signal.monitoring = false;
  ui.playheadMs = null;
}

/** Plays the stretch of the take that is in view, or all of it. */
export function startMonitor() {
  stopMonitor();
  const take = signal.take;
  const source = take && sourceOf(take);
  if (!take || !source) return;
  try {
    // The stretch in view on the pulses' time axis, then in the tap's own samples.
    const from = ui.span ? ui.span.fromMs * SAMPLES_PER_MS : 0;
    const to = ui.span ? ui.span.toMs * SAMPLES_PER_MS : take.pulses.length;
    const first = Math.max(0, Math.round(from - source.offset));
    const end = Math.min(source.tap.samples.length, Math.round(to - source.offset));
    if (end <= first) return;
    const mine = (playback = playSamples(audible(source.tap.samples.subarray(first, end), source.tap.stage), ui.monitorVolume));
    signal.monitoring = true;
    const follow = () => {
      if (playback !== mine) return;
      ui.playheadMs = (first + source.offset + mine.position()) / SAMPLES_PER_MS;
      frame = requestAnimationFrame(follow);
    };
    follow();
    void mine.ended.then(() => playback === mine && stopMonitor());
  } catch (error) {
    stopMonitor();
    fail(error);
  }
}

export function toggleMonitor() {
  if (signal.monitoring) stopMonitor();
  else startMonitor();
}

// A take that changed under the playhead is no longer what is being heard.
watch(() => signal.take, stopMonitor);
watch(
  () => ui.monitorVolume,
  (volume) => setVolume(volume),
);

// --- the microphone's chain as it runs -----------------------------------------

let liveMonitor: LiveMonitor | undefined;
let starting = false;

/** Hands the monitor one block of the microphone's chain, when listening live is on. */
export function monitorLive(input: Float32Array, reply: LiveReply) {
  if (!liveMonitor) return;
  if (ui.monitorSource === "input") liveMonitor.push(input);
  else if (ui.monitorSource === "pulses") liveMonitor.push(audible(reply.pulses, "pulse"));
  else if (reply.tap) liveMonitor.push(reply.tap.samples);
}

async function setLive(on: boolean) {
  if (!on) {
    liveMonitor?.stop();
    liveMonitor = undefined;
    return;
  }
  if (liveMonitor || starting) return;
  starting = true;
  try {
    liveMonitor = await startLiveMonitor(ui.monitorVolume);
    if (!(ui.monitorLive && signal.micOn)) await setLive(false); // switched off while it started
  } catch (error) {
    ui.monitorLive = false;
    fail(error);
  } finally {
    starting = false;
  }
}

watch(
  () => ui.monitorLive && signal.micOn,
  (on) => void setLive(on),
);
