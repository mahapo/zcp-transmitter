// The receive monitor must find the transmitter's pulses in what the receiver
// hears: a carrier 500 kHz off centre, in noise, on top of the receiver's own offset.
import { expect, test } from "vitest";
import { compareOnsets } from "../src/dsp/compare.ts";
import { PulseDetector } from "../src/dsp/detect.ts";

const RATE = 2_500_000;
const OFFSET_HZ = 500_000;

/** A repeatable source of noise. */
function noise(seed: number): () => number {
  let state = seed;
  const uniform = () => ((state = (state * 1664525 + 1013904223) >>> 0), state / 2 ** 32);
  return () => Math.sqrt(-2 * Math.log(uniform() + 1e-12)) * Math.cos(2 * Math.PI * uniform());
}

/** What a 12-bit receiver would give for pulses of `amplitude` beginning at `starts`, each `length` samples long. */
function received(samples: number, starts: number[], length: number, amplitude: number, noiseLevel = 6, dc = [40, -25]): Int16Array {
  const iq = new Int16Array(2 * samples);
  const random = noise(7);
  const on = new Uint8Array(samples);
  for (const start of starts) on.fill(1, start, start + length);
  for (let n = 0; n < samples; n++) {
    const phase = (2 * Math.PI * OFFSET_HZ * n) / RATE;
    const level = on[n] ? amplitude : 0;
    iq[2 * n] = Math.max(-2048, Math.min(2047, Math.round(dc[0] + level * Math.cos(phase) + noiseLevel * random())));
    iq[2 * n + 1] = Math.max(-2048, Math.min(2047, Math.round(dc[1] + level * Math.sin(phase) + noiseLevel * random())));
  }
  return iq;
}

const starts = Array.from({ length: 60 }, (_, n) => 1000 + n * 1900 + ((n * 137) % 400));
const PULSE = 250; // 100 µs

test("pulses are found where they are, at their length", () => {
  const found = new PulseDetector(RATE).push(received(125_000, starts, PULSE, 600));
  expect(found.onsets.length).toBe(starts.length);
  expect(compareOnsets(starts, found.onsets, 3)).toMatchObject({ matched: starts.length, onlyA: 0, onlyB: 0 });
  for (const length of found.lengths) expect(Math.abs(length - PULSE)).toBeLessThanOrEqual(6);
  expect(found.peak / found.noise).toBeGreaterThan(20);
  expect(found.duty).toBeCloseTo((starts.length * PULSE) / 125_000, 2);
  expect(found.largest).toBeLessThan(2048);
});

test("the stream may be cut anywhere, also inside a pulse", () => {
  const iq = received(125_000, starts, PULSE, 600);
  for (const block of [125_000, 10_000, 3_333, 1_024]) {
    const detector = new PulseDetector(RATE);
    const onsets: number[] = [];
    const lengths: number[] = [];
    for (let at = 0; at < 125_000; at += block) {
      const found = detector.push(iq.subarray(2 * at, 2 * Math.min(125_000, at + block)));
      onsets.push(...found.onsets);
      lengths.push(...found.lengths);
    }
    expect(compareOnsets(starts, onsets, 3)).toMatchObject({ matched: starts.length, onlyA: 0, onlyB: 0 });
    for (const length of lengths) expect(Math.abs(length - PULSE)).toBeLessThanOrEqual(6);
  }
});

test("weak pulses are still found, and noise alone gives none", () => {
  // 14 dB above the noise.
  const weak = new PulseDetector(RATE).push(received(125_000, starts, PULSE, 45));
  expect(compareOnsets(starts, weak.onsets, 4).matched).toBeGreaterThanOrEqual(starts.length - 1);
  const silence = new PulseDetector(RATE).push(received(125_000, [], PULSE, 0));
  expect(silence.onsets).toEqual([]);
  expect(silence.peak).toBe(0);
  expect(silence.noise).toBeGreaterThan(0);
  expect(new PulseDetector(RATE).push(new Int16Array(0)).onsets).toEqual([]);
});

test("the shortest pulses pass, spikes do not", () => {
  const short = new PulseDetector(RATE).push(received(125_000, starts, 62, 600)); // 25 µs
  expect(short.onsets.length).toBe(starts.length);
  const spikes = new PulseDetector(RATE).push(received(125_000, starts, 8, 600)); // 3 µs
  expect(spikes.onsets).toEqual([]);
});

test("an overdriven receiver shows in the largest sample", () => {
  expect(new PulseDetector(RATE).push(received(50_000, starts.slice(0, 20), PULSE, 5000)).largest).toBeGreaterThanOrEqual(2047);
});
