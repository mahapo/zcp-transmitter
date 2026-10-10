// The microphone feeds the chain block by block, so blocks must give exactly
// what one pass gives.
import { expect, test } from "vitest";
import { ZcpChain } from "../src/dsp/chain.ts";
import { type ChainConfig, FILTERS, type Filters, appDefaults, catalogBaseline, catalogLabel, noFilters } from "../src/dsp/config.ts";
import { referenceUtterance } from "./helpers/utterance.ts";

const BLOCK_SAMPLES = 2400; // the 50 ms blocks of src/audio/capture.worklet.js

const audio = referenceUtterance();
const withFilters = (filters: Partial<Filters>): ChainConfig => ({ ...catalogBaseline(), filters: { ...noFilters(), ...filters } });
const configs: ChainConfig[] = [
  catalogBaseline(),
  appDefaults(),
  ...FILTERS.map(({ key }) => withFilters({ [key]: true })),
  withFilters({ notch: true, preEmphasis: true, fricative: true, f1Bandpass: true, decimate: true }),
  withFilters({ noiseGate: true, envelopeFollower: true, halfWave: true, hilbert: true }),
  { ...catalogBaseline(), pulseUs: 25, hpfHz: 160, lpfHz: 900 },
];

test.each(configs.map((config) => [`${catalogLabel(config.filters)} ${config.pulseUs}/${config.hpfHz}/${config.lpfHz}`, config] as const))(
  "%s",
  (_, config) => {
    const whole = new ZcpChain(config);
    const expected = whole.process(audio);

    const chain = new ZcpChain(config);
    const actual = new Float32Array(expected.length);
    let filled = 0;
    for (let start = 0; start < audio.length; start += BLOCK_SAMPLES) {
      const pulses = chain.process(audio.subarray(start, start + BLOCK_SAMPLES));
      actual.set(pulses, filled);
      filled += pulses.length;
    }

    expect(filled).toBe(expected.length);
    let differing = 0;
    for (let n = 0; n < expected.length; n++) if (actual[n] !== expected[n]) differing++;
    expect(differing).toBe(0);
    expect(chain.pulseCount).toBe(whole.pulseCount);
  },
);
