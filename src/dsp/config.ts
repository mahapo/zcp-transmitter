// Settings of the zero-crossing-pulse chain: constants, filter toggles and the
// combinations the reference catalog was generated for.

export const AUDIO_RATE = 48000; // Hz, the whole chain runs at this rate
export const CATALOG_RATE = 2_000_000; // Hz, IQ rate of the catalog files (the HackRF rate)
export const AMPLITUDE = 0.5; // pulse level relative to full scale (the app's "1 mW")
export const SILENCE_SECONDS = 0.1; // padding on each end of a synthesized utterance

/** Every optional filter, in chain-independent catalog order. `catalog` is its name in catalog file names. */
export const FILTERS = [
  { key: "notch", catalog: "notch", label: "50/60 Hz Notch", group: "conditioning" },
  { key: "preEmphasis", catalog: "pre_emph", label: "Pre-emphasis", group: "conditioning" },
  { key: "deEmphasis", catalog: "de_emph", label: "De-emphasis", group: "conditioning" },
  { key: "fricative", catalog: "fricative", label: "Fricative Suppressor", group: "conditioning" },
  { key: "f1Bandpass", catalog: "f1_bandpass", label: "F1 Formant Bandpass", group: "conditioning" },
  { key: "decimate", catalog: "decimate", label: "Downsample / Decimate", group: "conditioning" },
  { key: "noiseGate", catalog: "noise_gate", label: "Noise Gate", group: "noise" },
  { key: "envelopeFollower", catalog: "env_follower", label: "Envelope Follower", group: "noise" },
  { key: "spectralSub", catalog: "spectral_sub", label: "Spectral Subtraction", group: "noise" },
  { key: "halfWave", catalog: "hwrect", label: "Half-wave Rect.", group: "shaping" },
  { key: "schmitt", catalog: "schmitt", label: "Schmitt Trigger", group: "shaping" },
  { key: "hilbert", catalog: "hilbert", label: "Hilbert Envelope", group: "shaping" },
] as const;

export type FilterKey = (typeof FILTERS)[number]["key"];
export type FilterGroup = (typeof FILTERS)[number]["group"];
export type Filters = Record<FilterKey, boolean>;

export const FILTER_GROUPS: { id: FilterGroup; label: string }[] = [
  { id: "conditioning", label: "Signal Conditioning" },
  { id: "noise", label: "Noise / Silence" },
  { id: "shaping", label: "ZCR Shaping" },
];

export interface ChainConfig {
  filters: Filters;
  pulseUs: number;
  hpfHz: number;
  lpfHz: number;
}

/** Slider ranges of the app. */
export const SLIDERS = {
  pulseUs: { min: 25, max: 150, step: 5 },
  hpfHz: { min: 80, max: 160, step: 20 },
  lpfHz: { min: 900, max: 3600, step: 100 },
} as const;

export function noFilters(): Filters {
  return Object.fromEntries(FILTERS.map(({ key }) => [key, false])) as Filters;
}

/** The catalog's baseline: default sliders, every optional filter off. */
export function catalogBaseline(): ChainConfig {
  return { filters: noFilters(), pulseUs: 100, hpfHz: 100, lpfHz: 2300 };
}

/** What the app starts with. */
export function appDefaults(): ChainConfig {
  const filters = { ...noFilters(), decimate: true, noiseGate: true, spectralSub: true, halfWave: true, schmitt: true };
  return { ...catalogBaseline(), filters };
}

const EXCLUSIVE: [FilterKey, FilterKey][] = [
  ["preEmphasis", "deEmphasis"], // opposite spectral tilt
  ["schmitt", "hilbert"], // Schmitt flattens the envelope Hilbert needs
];
const NOISE_FILTERS: FilterKey[] = ["noiseGate", "envelopeFollower", "spectralSub"];

/** False for the one filter that would turn on all three noise filters at once. */
export function canEnable(filters: Filters, key: FilterKey): boolean {
  if (filters[key] || !NOISE_FILTERS.includes(key)) return true;
  return NOISE_FILTERS.filter((other) => filters[other]).length < 2;
}

/** Switches one filter, turning off whatever it excludes. */
export function withFilter(filters: Filters, key: FilterKey, on: boolean): Filters {
  if (on && !canEnable(filters, key)) return filters;
  const next = { ...filters, [key]: on };
  if (on) {
    for (const [a, b] of EXCLUSIVE) {
      if (key === a) next[b] = false;
      if (key === b) next[a] = false;
    }
  }
  return next;
}

/**
 * Filters from anywhere (a link, a stored preset) with the rules applied: of
 * two that exclude each other the one later in FILTERS stays, and a third
 * noise filter is left off.
 */
export function normalizeFilters(filters: Partial<Record<FilterKey, unknown>>): Filters {
  let result = noFilters();
  for (const { key } of FILTERS) if (filters[key] === true) result = withFilter(result, key, true);
  return result;
}

/** A slider value brought into its range and onto its steps; anything that is not a number becomes the default. */
function snap(key: keyof typeof SLIDERS, value: unknown): number {
  const { min, max, step } = SLIDERS[key];
  if (typeof value !== "number" || !Number.isFinite(value)) return catalogBaseline()[key];
  return Math.max(min, Math.min(max, min + Math.round((value - min) / step) * step));
}

/** Settings from anywhere, made valid: see normalizeFilters, and the sliders snapped to SLIDERS. */
export function normalizeConfig(config: { filters?: Partial<Record<FilterKey, unknown>>; pulseUs?: unknown; hpfHz?: unknown; lpfHz?: unknown }): ChainConfig {
  return {
    filters: normalizeFilters(config.filters ?? {}),
    pulseUs: snap("pulseUs", config.pulseUs),
    hpfHz: snap("hpfHz", config.hpfHz),
    lpfHz: snap("lpfHz", config.lpfHz),
  };
}

/** The catalog file name for a set of filters, e.g. "notch+decimate". */
export function catalogLabel(filters: Filters): string {
  const on = FILTERS.filter(({ key }) => filters[key]).map(({ catalog }) => catalog);
  return on.length > 0 ? on.join("+") : "baseline";
}

/** The filters named by a catalog label; undefined if a name is unknown. */
export function filtersFromLabel(label: string): Filters | undefined {
  const filters = noFilters();
  if (label === "baseline") return filters;
  for (const name of label.split("+")) {
    const filter = FILTERS.find(({ catalog }) => catalog === name);
    if (!filter) return undefined;
    filters[filter.key] = true;
  }
  return filters;
}

export interface CatalogEntry {
  folder: string;
  name: string;
  config: ChainConfig;
}

/** Every configuration of the catalog, as enumerate_configs() in generate_combinations.py lists them. */
export function* enumerateConfigs(): Generator<CatalogEntry> {
  const entry = (folder: string, name: string, change: Partial<ChainConfig>): CatalogEntry => ({
    folder,
    name,
    config: { ...catalogBaseline(), ...change },
  });
  // All filters off is the baseline, which is listed once on its own.
  const combo = function* (folder: string, chosen: Partial<Filters>): Generator<CatalogEntry> {
    const filters = { ...noFilters(), ...chosen };
    if (Object.values(filters).some(Boolean)) yield entry(folder, catalogLabel(filters), { filters });
  };
  const both = [false, true];

  yield entry("_baseline", "baseline", {});

  for (const notch of both)
    for (const tilt of ["none", "pre", "de"])
      for (const fricative of both)
        for (const f1Bandpass of both)
          for (const decimate of both)
            yield* combo("signal_conditioning", {
              notch,
              preEmphasis: tilt === "pre",
              deEmphasis: tilt === "de",
              fricative,
              f1Bandpass,
              decimate,
            });

  for (const noiseGate of both)
    for (const envelopeFollower of both)
      for (const spectralSub of both)
        if (!(noiseGate && envelopeFollower && spectralSub))
          yield* combo("noise_silence", { noiseGate, envelopeFollower, spectralSub });

  for (const halfWave of both)
    for (const shape of ["none", "schmitt", "hilbert"])
      yield* combo("zcr_shaping", { halfWave, schmitt: shape === "schmitt", hilbert: shape === "hilbert" });

  const pad = (value: number, width: number) => String(value).padStart(width, "0");
  for (const us of [25, 50, 75, 125, 150]) yield entry("slider_sweeps/pulse", `pulse_${pad(us, 3)}us`, { pulseUs: us });
  for (const hz of [80, 100, 120, 140, 160]) yield entry("slider_sweeps/hpf", `hpf_${pad(hz, 3)}hz`, { hpfHz: hz });
  for (const hz of [900, 1500, 2300, 3000, 3600]) yield entry("slider_sweeps/lpf", `lpf_${pad(hz, 4)}hz`, { lpfHz: hz });
}
