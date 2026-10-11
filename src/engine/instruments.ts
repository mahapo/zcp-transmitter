// The live instruments: what the microphone's chain is doing right now, and
// what has gone out lately. The samples live in rings outside Vue's reactivity;
// `tick` tells the canvases when to repaint, at most once per frame.
import { ref } from "vue";
import { STAGES } from "../dsp/chain.ts";
import { OnsetTracker } from "../dsp/analysis.ts";
import { dutyCycle } from "../dsp/chain.ts";
import { AUDIO_RATE } from "../dsp/config.ts";
import { FFT_SIZE } from "../dsp/spectrogram.ts";
import { Ring } from "../lib/ring.ts";
import { signal } from "../state/signal.ts";
import { waterfallDsp } from "./dspClient.ts";
import type { LiveReply } from "./protocol.ts";

const RING_SECONDS = 10;
const DUTY_WINDOW_SAMPLES = AUDIO_RATE / 10; // one point of the duty history per 100 ms
const DUTY_POINTS = 600; // a minute of them
const GAPS_KEPT = 4000;
const READOUT_MS = 100; // numbers on screen change at most this often
const PEAK_DECAY = 0.8; // per block, so the flowgraph's level bars fall back visibly
/** Columns of the rolling waterfall that are kept: 4096 of 4 ms are 16 s. */
export const ROLLING_COLUMNS = 4096;

/** Counts up whenever an instrument has something new to draw. */
export const tick = ref(0);
let scheduled = false;
function changed() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    tick.value++;
  });
}

// --- the microphone's chain ---------------------------------------------------

/** The latest ten seconds of the microphone, of the stage in view and of the pulses made from them, sample for sample in step. */
export const live = {
  input: new Ring(RING_SECONDS * AUDIO_RATE),
  stage: new Ring(RING_SECONDS * AUDIO_RATE),
  pulses: new Ring(RING_SECONDS * AUDIO_RATE),
  /** Which stage `stage` holds; it starts afresh when another is chosen. */
  stageId: signal.stage,
};

let lastReadout = 0;
const peaks = new Float32Array(STAGES.length);

/** Takes one block of the microphone and what the chain made of it. */
export function feedLive(input: Float32Array, reply: LiveReply) {
  live.input.push(input);
  if (reply.tap) {
    if (reply.tap.stage !== live.stageId) {
      live.stage.clear();
      live.stage.skip(live.input.total - input.length);
      live.stageId = reply.tap.stage;
    }
    // A filter that was just switched on drops its first outputs; silence keeps the rings in step.
    live.stage.skip(reply.tap.skipped);
    live.stage.push(reply.tap.samples);
  }
  live.pulses.skip(input.length - reply.pulses.length);
  live.pulses.push(reply.pulses);

  for (let stage = 0; stage < peaks.length; stage++) {
    const now = reply.peaks[stage];
    peaks[stage] = Number.isNaN(now) ? Number.NaN : Math.max(now, (peaks[stage] || 0) * PEAK_DECAY);
  }
  const time = performance.now();
  if (time - lastReadout >= READOUT_MS) {
    lastReadout = time;
    signal.agcGain = reply.agcGain;
    signal.livePeaks = peaks.slice();
  }
  changed();
}

/** Forgets the microphone's signal, for when it is switched on again. */
export function resetLive() {
  live.input.clear();
  live.stage.clear();
  live.pulses.clear();
  peaks.fill(0);
  signal.livePeaks = null;
}

// --- what goes out --------------------------------------------------------------

/** What has gone to the transmitter, the recorder or just the meter lately. */
export const air = {
  /** Duty cycle per 100 ms, the latest last. */
  duty: new Ring(DUTY_POINTS),
  /** Samples between the starts of consecutive pulses, the latest last. */
  gaps: new Ring(GAPS_KEPT),
  /** Rolling waterfall: ROLLING_COLUMNS columns of FFT_SIZE levels, written round and round. */
  columns: new Uint8Array(ROLLING_COLUMNS * FFT_SIZE),
  /** Columns written since the start. */
  columnCount: 0,
};

const onsets = new OnsetTracker();
let lastOnset = -1;
let dutyRest = new Float32Array(0); // pulses that do not yet fill a window of the duty history
let recentOnsets: number[] = []; // stream positions of the pulses of the last second
let rateTimer: ReturnType<typeof setTimeout> | undefined;

/** Takes pulses that have just gone out. Called with whatever the duty meter is shown. */
export function feedAir(pulses: Float32Array) {
  if (pulses.length === 0) return;

  const begun = onsets.push(pulses);
  const gaps: number[] = [];
  for (const at of begun) {
    if (lastOnset >= 0) gaps.push(at - lastOnset);
    lastOnset = at;
  }
  air.gaps.push(Float32Array.from(gaps));
  recentOnsets = [...recentOnsets, ...begun].filter((at) => at > onsets.total - AUDIO_RATE);
  signal.pulseRate = recentOnsets.length;
  clearTimeout(rateTimer);
  rateTimer = setTimeout(() => (signal.pulseRate = 0), 1000);

  const joined = new Float32Array(dutyRest.length + pulses.length);
  joined.set(dutyRest);
  joined.set(pulses, dutyRest.length);
  const windows = Math.floor(joined.length / DUTY_WINDOW_SAMPLES);
  air.duty.push(Float32Array.from({ length: windows }, (_, n) => dutyCycle(joined, n * DUTY_WINDOW_SAMPLES, (n + 1) * DUTY_WINDOW_SAMPLES)));
  dutyRest = joined.slice(windows * DUTY_WINDOW_SAMPLES);

  // The waterfall is worked out off this thread; its columns arrive a moment later.
  void waterfallDsp.call({ kind: "waterfall", pulses }).then(({ columns }) => {
    for (let offset = 0; offset < columns.length; offset += FFT_SIZE) {
      air.columns.set(columns.subarray(offset, offset + FFT_SIZE), (air.columnCount % ROLLING_COLUMNS) * FFT_SIZE);
      air.columnCount++;
    }
    changed();
  });
  changed();
}
