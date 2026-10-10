// The rules the panels rely on: which filters exclude each other, how settings
// are named, and what the catalog consists of.
import { expect, test } from "vitest";
import {
  FILTERS,
  SLIDERS,
  appDefaults,
  canEnable,
  catalogBaseline,
  catalogLabel,
  enumerateConfigs,
  filtersFromLabel,
  noFilters,
  withFilter,
} from "../src/dsp/config.ts";

test("opposite filters switch each other off", () => {
  const pre = withFilter(noFilters(), "preEmphasis", true);
  expect(withFilter(pre, "deEmphasis", true)).toMatchObject({ preEmphasis: false, deEmphasis: true });
  const schmitt = withFilter(noFilters(), "schmitt", true);
  expect(withFilter(schmitt, "hilbert", true)).toMatchObject({ schmitt: false, hilbert: true });
  expect(withFilter(withFilter(schmitt, "hilbert", true), "schmitt", true)).toMatchObject({ schmitt: true, hilbert: false });
});

test("the three noise filters never all run at once", () => {
  const two = { ...noFilters(), noiseGate: true, spectralSub: true };
  expect(canEnable(two, "envelopeFollower")).toBe(false);
  expect(withFilter(two, "envelopeFollower", true)).toBe(two);
  expect(canEnable(two, "noiseGate")).toBe(true); // already on, so it can be switched off
  expect(canEnable(two, "notch")).toBe(true);
  expect(canEnable(withFilter(two, "noiseGate", false), "envelopeFollower")).toBe(true);
});

test("the app starts from the original's defaults", () => {
  const { filters, ...sliders } = appDefaults();
  expect(catalogLabel(filters)).toBe("decimate+noise_gate+spectral_sub+hwrect+schmitt");
  expect(sliders).toEqual({ pulseUs: 100, hpfHz: 100, lpfHz: 2300 });
  expect(catalogLabel(catalogBaseline().filters)).toBe("baseline");
});

test("catalog names and filters convert both ways", () => {
  for (const { config } of enumerateConfigs()) {
    expect(filtersFromLabel(catalogLabel(config.filters))).toEqual(config.filters);
  }
  expect(filtersFromLabel("notch+nonsense")).toBeUndefined();
  expect(FILTERS.map(({ catalog }) => catalog).join(" ")).toBe(
    "notch pre_emph de_emph fricative f1_bandpass decimate noise_gate env_follower spectral_sub hwrect schmitt hilbert",
  );
});

test("the catalog has 74 configurations in the generator's folders", () => {
  const entries = [...enumerateConfigs()];
  expect(new Set(entries.map(({ folder, name }) => `${folder}/${name}`)).size).toBe(74);
  const perFolder: Record<string, number> = {};
  for (const { folder } of entries) perFolder[folder] = (perFolder[folder] ?? 0) + 1;
  expect(perFolder).toEqual({
    _baseline: 1,
    signal_conditioning: 47,
    noise_silence: 6,
    zcr_shaping: 5,
    "slider_sweeps/pulse": 5,
    "slider_sweeps/hpf": 5,
    "slider_sweeps/lpf": 5,
  });
});

test("every swept value can be set with its slider", () => {
  for (const { config } of enumerateConfigs()) {
    for (const key of ["pulseUs", "hpfHz", "lpfHz"] as const) {
      const { min, max, step } = SLIDERS[key];
      expect(config[key]).toBeGreaterThanOrEqual(min);
      expect(config[key]).toBeLessThanOrEqual(max);
      expect((config[key] - min) % step).toBe(0);
    }
  }
});
