// The receive monitor: the SDR's own receiver listens on the transmit frequency
// and reports the pulses it hears. While the transmitter runs, they are held
// against the pulses that were sent.
import { ref, watch } from "vue";
import { OnsetTracker } from "../dsp/analysis.ts";
import { compareLoopback } from "../dsp/compare.ts";
import { AUDIO_RATE } from "../dsp/config.ts";
import { ENVELOPE_POINTS, PulseDetector } from "../dsp/detect.ts";
import type { SdrDevice } from "../sdr/device.ts";
import { radio } from "../state/radio.ts";
import { text } from "../text.ts";
import { connection } from "./device.ts";
import { fail, say } from "./status.ts";

const READOUT_MS = 200; // numbers on screen change at most this often
const KEPT_SECONDS = 8; // of sent and received pulse starts
const COMPARE_SECONDS = 2; // the stretch of sent pulses that is looked for in what came back
const MAX_DELAY_SECONDS = 3; // between a pulse being queued and being heard
const TOLERANCE_SAMPLES = 2; // at 48 kHz: 42 µs
const CLIP_SHARE = 0.98; // of full scale

/** The magnitude of the latest block, for the monitor's scope, and the levels to draw into it. Not reactive. */
export const rxScope = { envelope: new Float32Array(ENVELOPE_POINTS), noise: 0, peak: 0, fullScale: 1 };
/** Counts up when rxScope has changed. */
export const rxTick = ref(0);

let running: Promise<void> | undefined;
let sent: number[] = []; // pulse starts at 48 kHz, counted from the start of the transmission
let received: number[] = []; // the same for the receiver's stream
const sentTracker = { tracker: new OnsetTracker() };

const db = (ratio: number) => (ratio > 0 ? 20 * Math.log10(ratio) : -Infinity);

/** Notes the pulses the transmitter was just given, for comparing with what comes back. */
export function logSent(pulses: Float32Array) {
  sent.push(...sentTracker.tracker.push(pulses));
  const oldest = sentTracker.tracker.total - KEPT_SECONDS * AUDIO_RATE;
  if (sent.length > 0 && sent[0] < oldest) sent = sent.filter((at) => at >= oldest);
}

/** Starts a new record of sent pulses: the transmitter's stream has started or ended. */
export function resetSent() {
  sent = [];
  sentTracker.tracker = new OnsetTracker();
  radio.loopback = null;
}

/** Holds the last stretch of sent pulses that must have arrived by now against what was received. */
function compare(receivedTotal: number) {
  if (radio.tx !== "on" || sent.length === 0) return (radio.loopback = null);
  // What was queued within the last moments may not have been through the air yet.
  const until = sentTracker.tracker.total - MAX_DELAY_SECONDS * AUDIO_RATE;
  const window = sent.filter((at) => at <= until && at > until - COMPARE_SECONDS * AUDIO_RATE);
  if (window.length === 0 || receivedTotal < (MAX_DELAY_SECONDS + COMPARE_SECONDS) * AUDIO_RATE) return;
  const { matched, onlyA, onlyB, lag } = compareLoopback(window, received, TOLERANCE_SAMPLES, MAX_DELAY_SECONDS * AUDIO_RATE);
  radio.loopback = { sent: window.length, matched, missing: onlyA, extra: onlyB, lagMs: (lag / AUDIO_RATE) * 1000 };
}

async function receive(sdr: SdrDevice) {
  const rx = sdr.rx!;
  // Both directions share one sample rate; with the transmitter running it is the transmitter's.
  const { sampleRate, fullScale } = await rx.start({ frequency: radio.frequencyHz, gain: radio.rxGain, ownsRate: radio.tx === "off" });
  try {
    const detector = new PulseDetector(sampleRate);
    received = [];
    let total = 0; // samples received, at the receiver's rate
    let lastReadout = 0;
    let lastCompare = 0;
    let recent: { at: number; pulses: number; inside: number; samples: number }[] = [];
    if (radio.rx === "starting") radio.rx = "on"; // unless it was stopped meanwhile
    say(text.rx.listening(radio.frequencyHz, sampleRate));

    while (radio.rx === "on") {
      const iq = await rx.read();
      const found = detector.push(iq);
      const samples = iq.length / 2;
      total += samples;
      for (const onset of found.onsets) received.push(Math.round((onset * AUDIO_RATE) / sampleRate));
      const oldest = ((total - KEPT_SECONDS * sampleRate) * AUDIO_RATE) / sampleRate;
      if (received.length > 0 && received[0] < oldest) received = received.filter((at) => at >= oldest);

      Object.assign(rxScope, { envelope: found.envelope, noise: found.noise, peak: found.peak, fullScale });
      rxTick.value++;

      const now = performance.now();
      recent.push({ at: now, pulses: found.onsets.length, inside: found.duty * samples, samples });
      recent = recent.filter((block) => block.at > now - 1000);
      if (now - lastReadout >= READOUT_MS) {
        lastReadout = now;
        const heard = recent.reduce((sum, block) => sum + block.samples, 0);
        radio.rxLevel = {
          rmsDb: db(found.rms / fullScale),
          noiseDb: db(found.noise / fullScale),
          peakDb: found.peak > 0 ? db(found.peak / fullScale) : null,
          snrDb: found.peak > 0 ? db(found.peak / found.noise) : null,
          clipped: found.largest >= fullScale * CLIP_SHARE,
          pulseRate: Math.round((recent.reduce((sum, block) => sum + block.pulses, 0) * sampleRate) / heard),
          duty: recent.reduce((sum, block) => sum + block.inside, 0) / heard,
        };
      }
      if (now - lastCompare >= 1000) {
        lastCompare = now;
        compare((total * AUDIO_RATE) / sampleRate);
      }
    }
  } finally {
    await rx.stop();
  }
}

/** Starts the receiver, if the user wants it and the device has one. */
function start() {
  const sdr = connection.device;
  if (!sdr?.rx || radio.rx !== "off") return;
  radio.rx = "starting";
  running = receive(sdr)
    .catch((error) => {
      radio.rxWanted = false;
      fail(error);
    })
    .finally(() => {
      radio.rx = "off";
      radio.rxLevel = null;
      radio.loopback = null;
    });
}

async function stop() {
  if (radio.rx === "on" || radio.rx === "starting") radio.rx = "stopping";
  await running;
}

export function startRx() {
  radio.rxWanted = true;
  start();
}

export async function stopRx() {
  radio.rxWanted = false;
  await stop();
  say(text.rx.stopped);
}

/**
 * Stops the receiver for a moment without forgetting that it is wanted. The
 * transmitter calls this before it sets or restores the shared sample rate.
 */
export async function suspendRx() {
  await stop();
}

/** Starts the receiver again after suspendRx, if it is still wanted. */
export function resumeRx() {
  if (radio.rxWanted) start();
}

export async function setRxGain(gain: number) {
  radio.rxGain = gain;
  if (radio.rx === "on") await connection.device?.rx?.setGain(gain).catch(fail);
}

// The receiver follows the frequency while nothing transmits; on air the frequency is locked.
watch(
  () => radio.frequencyHz,
  async () => {
    if (radio.rx !== "on" || radio.tx !== "off") return;
    await stop();
    resumeRx();
  },
);
