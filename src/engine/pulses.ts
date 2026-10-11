// Pulses on their way out: to the transmitter's queue, the recorder and the duty meter.
import { dutyCycle } from "../dsp/chain.ts";
import { AUDIO_RATE } from "../dsp/config.ts";
import { PulseQueue } from "../dsp/resample.ts";
import { radio } from "../state/radio.ts";
import { signal } from "../state/signal.ts";
import { capture } from "./recorder.ts";

const METER_SAMPLES = AUDIO_RATE / 10; // duty cycle is measured over 100 ms
const METER_HOLD_MS = 400; // the live meter falls back to zero after this long without pulses

/** Pulses waiting for the transmitter. */
export const queue = new PulseQueue();
let meterTimer: ReturnType<typeof setTimeout> | undefined;

/** Shows the duty cycle of `pulses`, 100 ms at a time. */
export function meter(pulses: Float32Array) {
  for (let start = 0; start < pulses.length; start += METER_SAMPLES) {
    signal.dutyLive = dutyCycle(pulses, start, Math.min(pulses.length, start + METER_SAMPLES));
    signal.dutyPeak = Math.max(signal.dutyPeak, signal.dutyLive);
  }
  clearTimeout(meterTimer);
  meterTimer = setTimeout(() => (signal.dutyLive = 0), METER_HOLD_MS);
}

/**
 * Sends freshly made pulses wherever they are wanted. This is the only way
 * pulses reach the transmitter, and only what the user asked to play gets here.
 */
export function emit(pulses: Float32Array, pulseCount: number) {
  signal.pulses += pulseCount;
  if (radio.tx === "on") queue.push(pulses);
  else meter(pulses); // while transmitting the meter shows what goes on air
  capture(pulses);
}
