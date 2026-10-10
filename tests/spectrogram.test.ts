// spectrogram() must keep the maths of the catalog's generate_waterfall(). The
// yardstick is a frozen copy of the file as it was when that was checked.
import { expect, test } from "vitest";
import { ZcpChain } from "../src/dsp/chain.ts";
import { type ChainConfig, appDefaults, catalogBaseline, noFilters } from "../src/dsp/config.ts";
import { spectrogram } from "../src/dsp/spectrogram.ts";
import { referenceUtterance } from "./helpers/utterance.ts";
import { spectrogram as frozen } from "./reference/spectrogram.frozen.ts";

function expectSame(pulses: Float32Array, sampleRate?: number) {
  const expected = frozen(pulses, sampleRate);
  const actual = spectrogram(pulses, sampleRate);
  if (!expected) return expect(actual).toBeUndefined();
  if (!actual) throw new Error("no spectrogram");

  for (const key of ["sampleRate", "start", "length", "frames", "hop", "minDb", "maxDb"] as const) expect(actual[key]).toBe(expected[key]);
  expect(actual.db.length).toBe(expected.db.length);
  // Bit patterns, so that not even a rounding step or the sign of a zero may differ.
  const bits = new Uint32Array(actual.db.buffer, actual.db.byteOffset, actual.db.length);
  const expectedBits = new Uint32Array(expected.db.buffer, expected.db.byteOffset, expected.db.length);
  let differing = 0;
  for (let n = 0; n < bits.length; n++) if (bits[n] !== expectedBits[n]) differing++;
  expect(differing).toBe(0);
  for (let n = -3; n < expected.length + 3; n += 7) expect(actual.envelope(n)).toBe(expected.envelope(n));
}

const audio = referenceUtterance();
const chainOutputs: [string, ChainConfig][] = [
  ["catalog baseline", catalogBaseline()],
  ["app defaults", appDefaults()],
  ["25 µs pulses", { ...catalogBaseline(), pulseUs: 25 }],
  ["Hilbert envelope", { ...catalogBaseline(), filters: { ...noFilters(), hilbert: true } }],
];

test.each(chainOutputs)("%s", (_, config) => {
  expectSame(new ZcpChain(config).process(audio));
});

test("at an SDR's own sample rate", () => {
  expectSame(new ZcpChain(catalogBaseline()).process(audio), 2_500_000);
});

test("a train longer than the three-second cap", () => {
  expectSame(Float32Array.from({ length: 6 * 48000 }, (_, n) => (n % 337 < 5 ? 1 : 0)));
});

test("pulses at the very ends", () => {
  const first = new Float32Array(4800);
  first[0] = 1;
  expectSame(first);
  const last = new Float32Array(4800);
  last[4799] = 1;
  expectSame(last);
  const both = new Float32Array(4800);
  both[0] = both[4799] = 1;
  expectSame(both);
});

test("nothing to show", () => {
  expectSame(new Float32Array(4800));
  expectSame(Float32Array.of(1));
  expect(spectrogram(new Float32Array(4800))).toBeUndefined();
});
