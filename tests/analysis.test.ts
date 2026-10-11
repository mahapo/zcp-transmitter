// The measurements the instruments show.
import { expect, test } from "vitest";
import { OnsetTracker, onsets, plannedFft, spectrumDb } from "../src/dsp/analysis.ts";
import { fft } from "../src/dsp/spectrogram.ts";
import { Ring } from "../src/lib/ring.ts";

test("pulse starts are found across block borders", () => {
  const pulses = Float32Array.of(1, 1, 0, 0, 1, 1, 1, 0, 1, 0, 0, 1);
  expect(onsets(pulses)).toEqual([0, 4, 8, 11]);
  for (const block of [1, 2, 3, 5, 12]) {
    const tracker = new OnsetTracker();
    const found: number[] = [];
    for (let start = 0; start < pulses.length; start += block) found.push(...tracker.push(pulses.subarray(start, start + block)));
    expect(found).toEqual([0, 4, 8, 11]);
    expect(tracker.total).toBe(pulses.length);
  }
});

test("the planned FFT equals the spectrogram's", () => {
  const re = Float64Array.from({ length: 64 }, (_, n) => Math.sin(n * 0.7) + 0.3 * Math.cos(n * 2.1));
  const im = new Float64Array(64);
  const expectedRe = re.slice();
  const expectedIm = im.slice();
  fft(expectedRe, expectedIm);
  plannedFft(64)(re, im);
  re.forEach((value, n) => expect(value).toBeCloseTo(expectedRe[n], 10));
  im.forEach((value, n) => expect(value).toBeCloseTo(expectedIm[n], 10));
});

test("a full-scale sine reads 0 dB at its frequency", () => {
  const RATE = 48000;
  const SIZE = 2048;
  const bin = 43; // exactly on a bin, so nothing leaks
  const sine = Float32Array.from({ length: RATE }, (_, n) => Math.sin((2 * Math.PI * bin * n) / SIZE));
  const db = spectrumDb(sine, 0, sine.length, SIZE);
  expect(db.length).toBe(SIZE / 2 + 1);
  expect(db.indexOf(Math.max(...db))).toBe(bin);
  expect(db[bin]).toBeCloseTo(0, 1);
  expect(db[bin + 40]).toBeLessThan(-80);
  // Half the amplitude is 6 dB less, and a stretch shorter than one segment still works.
  expect(spectrumDb(sine.map((value) => value / 2), 0, sine.length, SIZE)[bin]).toBeCloseTo(-6.02, 1);
  expect(spectrumDb(sine, 100, 600, SIZE).length).toBe(SIZE / 2 + 1);
  expect(Math.max(...spectrumDb(new Float32Array(100)))).toBe(-140);
});

test("a ring keeps the latest samples in order", () => {
  const ring = new Ring(5);
  expect(Array.from(ring.latest(3))).toEqual([0, 0, 0]);
  ring.push(Float32Array.of(1, 2, 3));
  expect(Array.from(ring.latest(5))).toEqual([0, 0, 1, 2, 3]);
  ring.push(Float32Array.of(4, 5, 6, 7));
  expect(Array.from(ring.latest(5))).toEqual([3, 4, 5, 6, 7]);
  expect(Array.from(ring.latest(2))).toEqual([6, 7]);
  expect(Array.from(ring.latest(7))).toEqual([0, 0, 3, 4, 5, 6, 7]);
  expect(ring.total).toBe(7);
  ring.push(Float32Array.of(10, 11, 12, 13, 14, 15, 16)); // longer than the ring
  expect(Array.from(ring.latest(5))).toEqual([12, 13, 14, 15, 16]);
  ring.skip(2);
  expect(Array.from(ring.latest(5))).toEqual([14, 15, 16, 0, 0]);
  expect(ring.total).toBe(16);
  ring.skip(9);
  expect(Array.from(ring.latest(5))).toEqual([0, 0, 0, 0, 0]);
  expect(ring.total).toBe(25);
  ring.clear();
  expect(ring.total).toBe(0);
});
