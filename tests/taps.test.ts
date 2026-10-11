// Watching the chain must not change it: with a probe attached, even one that
// ruins everything it is handed, the pulses stay those of the reference.
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { type Reference, matchReference } from "../src/catalog/reference.ts";
import { type ChainProbe, STAGES, type StageId, ZcpChain } from "../src/dsp/chain.ts";
import { type ChainConfig, FILTERS, appDefaults, catalogBaseline, enumerateConfigs, noFilters } from "../src/dsp/config.ts";
import { referenceUtterance } from "./helpers/utterance.ts";

const reference: Reference = JSON.parse(readFileSync(new URL("../src/catalog/reference.json", import.meta.url), "utf8"));
const configs = new Map([...enumerateConfigs()].map((entry) => [`${entry.folder}/${entry.name}`, entry.config]));
const audio = referenceUtterance();

interface Seen {
  stage: StageId;
  samples: Float32Array;
  skipped: number;
}

/** Keeps a copy of everything it is shown, then overwrites what it was handed. */
function hostileProbe(): ChainProbe & { seen: Seen[]; gain: Float32Array[] } {
  const seen: Seen[] = [];
  const gain: Float32Array[] = [];
  return {
    seen,
    gain,
    stage(stage, samples, skipped) {
      seen.push({ stage, samples: samples.slice(), skipped });
      samples.fill(Number.NaN);
    },
    agcGain(trace) {
      gain.push(trace.slice());
      trace.fill(Number.NaN);
    },
  };
}

function expectSame(actual: Float32Array, expected: Float32Array) {
  expect(actual.length).toBe(expected.length);
  let differing = 0;
  for (let n = 0; n < expected.length; n++) if (!Object.is(actual[n], expected[n])) differing++;
  expect(differing).toBe(0);
}

test.each(reference.entries.map((entry) => [entry.path, entry] as const))("%s", async (path, entry) => {
  const config = configs.get(path)!;
  const probe = hostileProbe();
  const chain = new ZcpChain(config);
  const pulses = chain.process(audio, probe);

  // Bit for bit GNU Radio's file, or else exactly what the chain makes unwatched.
  const match = await matchReference(pulses, entry);
  expect(match).not.toBe("different");
  if (match !== "identical") {
    const unwatched = new ZcpChain(config);
    expectSame(pulses, unwatched.process(audio));
    expect(chain.pulseCount).toBe(unwatched.pulseCount);
  }

  // Every stage that ran is reported once, in order, and accounts for all of the input.
  const expected = STAGES.filter((stage) => !FILTERS.some(({ key }) => key === stage) || config.filters[stage as keyof typeof config.filters]);
  expect(probe.seen.map(({ stage }) => stage)).toEqual(expected);
  for (const { samples, skipped } of probe.seen) expect(skipped + samples.length).toBe(audio.length);
  expectSame(probe.seen.at(-1)!.samples, pulses);
});

test("the gain trace is the gain the AGC applied", () => {
  const probe = hostileProbe();
  const chain = new ZcpChain(catalogBaseline());
  chain.process(audio, probe);
  const before = probe.seen.find(({ stage }) => stage === "lpf")!.samples;
  const after = probe.seen.find(({ stage }) => stage === "agc")!.samples;
  const [gain] = probe.gain;
  expect(gain[0]).toBe(1);
  expectSame(after, before.map((sample, n) => sample * gain[n]));
  // One more step of agc_ff from the last traced gain is where the chain now stands.
  const last = gain.length - 1;
  const next = Math.fround(gain[last] + Math.fround(Math.fround(0.5 - Math.abs(after[last])) * Math.fround(1e-4)));
  expect(chain.agcGain).toBe(Math.min(65536, next));
});

test("filters that drop their first outputs say how many", () => {
  const withFilters = (filters: Partial<ChainConfig["filters"]>): ChainConfig => ({ ...catalogBaseline(), filters: { ...noFilters(), ...filters } });
  const skips = (config: ChainConfig, stage: StageId) => {
    const probe = hostileProbe();
    new ZcpChain(config).process(audio, probe);
    return probe.seen.find((seen) => seen.stage === stage)!.skipped;
  };
  expect(skips(catalogBaseline(), "pulse")).toBe(0);
  expect(skips(withFilters({ preEmphasis: true }), "pulse")).toBe(1);
  expect(skips(withFilters({ preEmphasis: true }), "lpf")).toBe(0);
  const f1 = skips(withFilters({ f1Bandpass: true }), "f1Bandpass");
  expect(f1).toBeGreaterThan(1000);
  expect(skips(withFilters({ f1Bandpass: true }), "lpf")).toBe(0);
  expect(skips(withFilters({ f1Bandpass: true, preEmphasis: true }), "pulse")).toBe(f1 + 1);
});

test("a running chain is not disturbed either, also when filters are switched on underway", () => {
  const BLOCK_SAMPLES = 2400;
  const run = (watched: boolean) => {
    const chain = new ZcpChain(appDefaults());
    const parts: Float32Array[] = [];
    const skipped: number[] = [];
    for (let start = 0, block = 0; start < audio.length; start += BLOCK_SAMPLES, block++) {
      if (block === 4) chain.setConfig({ ...appDefaults(), filters: { ...appDefaults().filters, f1Bandpass: true, preEmphasis: true } });
      const probe = watched ? hostileProbe() : undefined;
      parts.push(chain.process(audio.subarray(start, start + BLOCK_SAMPLES), probe));
      if (probe) skipped.push(probe.seen.at(-1)!.skipped);
    }
    return { parts, skipped, pulseCount: chain.pulseCount };
  };
  const watched = run(true);
  const unwatched = run(false);
  expect(watched.pulseCount).toBe(unwatched.pulseCount);
  watched.parts.forEach((part, block) => expectSame(part, unwatched.parts[block]));
  // Only the block in which the filters came on is shortened.
  expect(watched.skipped.filter((count) => count > 0)).toEqual([watched.skipped[4]]);
  expect(watched.skipped[4]).toBeGreaterThan(1000);
});

test("a probe is only shown the stages it wants", () => {
  const probe = hostileProbe();
  new ZcpChain(appDefaults()).process(audio, { ...probe, wants: (stage) => stage === "agc" || stage === "notch", agcGain: undefined });
  expect(probe.seen.map(({ stage }) => stage)).toEqual(["agc"]);
  expect(probe.gain).toEqual([]);
});
