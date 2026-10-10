// The filter designs must equal GNU Radio's (fixtures from tools/gen_fixtures.py).
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { AUDIO_RATE } from "../src/dsp/config.ts";
import { Fir, bandPass, highPass, lowPass } from "../src/dsp/firdes.ts";

interface Fixtures {
  high_pass: Record<string, number[]>;
  low_pass: Record<string, number[]>;
  band_pass: number[];
}
const fixtures: Fixtures = JSON.parse(readFileSync(new URL("./fixtures/firdes.json", import.meta.url), "utf8"));

/** Largest difference between two tap sets, after checking they are equally long. */
function worst(actual: Float32Array, expected: number[]): number {
  expect(actual.length).toBe(expected.length);
  return expected.reduce((max, value, n) => Math.max(max, Math.abs(actual[n] - value)), 0);
}

test.each(Object.entries(fixtures.high_pass))("high-pass %s Hz", (hz, expected) => {
  expect(worst(highPass(AUDIO_RATE, Number(hz), 50), expected)).toBeLessThan(1e-9);
});

test.each(Object.entries(fixtures.low_pass))("low-pass %s Hz", (hz, expected) => {
  expect(worst(lowPass(AUDIO_RATE, Number(hz), 200), expected)).toBeLessThan(1e-9);
});

test("F1 band-pass", () => {
  expect(worst(bandPass(AUDIO_RATE, 300, 900, 100), fixtures.band_pass)).toBeLessThan(1e-9);
});

test("FIR is causal and keeps its history across blocks", () => {
  const taps = Float32Array.of(0.1, 0.2, 0.3);
  const whole = Float32Array.of(1, 2, 3, 4, 5, 6);
  new Fir(taps).process(whole);
  expect(Array.from(whole, (v) => Math.round(v * 10) / 10)).toEqual([0.1, 0.4, 1, 1.6, 2.2, 2.8]);

  const split = new Fir(taps);
  const head = Float32Array.of(1, 2);
  const tail = Float32Array.of(3, 4, 5, 6);
  split.process(head);
  split.process(tail);
  expect([...head, ...tail]).toEqual([...whole]);
});
