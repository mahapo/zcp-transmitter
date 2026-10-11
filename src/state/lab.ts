// The Catalog Lab: the catalog's configurations run over one utterance.
import { reactive } from "vue";
import type { Match } from "../catalog/reference.ts";
import { type CatalogEntry, enumerateConfigs } from "../dsp/config.ts";

export interface LabEntry extends CatalogEntry {
  /** Folder and name, e.g. "signal_conditioning/notch". */
  path: string;
  /** The earlier entry that gives the very same pulses, where there is one. */
  sameAs?: string;
}

/** What one configuration made of the utterance. */
export interface LabResult {
  /** Zero crossings that triggered a pulse. */
  crossings: number;
  /** Pulses as they go out: a crossing during a pulse only lengthens it. */
  pulses: number;
  duty: number;
  /** Samples of the input that have no counterpart in the pulse train. */
  skipped: number;
  /** The pulse train on the input's time axis, see pulseEdges in dsp/analysis.ts. */
  edges: Uint32Array;
  /** Waterfall thumbnail: `columns` columns of FFT_SIZE levels. */
  thumb: Uint8Array;
  columns: number;
  /** How the pulses compare with the catalog's, when the utterance is the reference one. */
  match?: Match;
}

/**
 * The key under which configurations that cannot differ share one run:
 * de-emphasis changes nothing, see the note in dsp/chain.ts.
 */
function resultKey({ config }: CatalogEntry): string {
  return JSON.stringify({ ...config, filters: { ...config.filters, deEmphasis: false } });
}

function entries(): LabEntry[] {
  const first = new Map<string, string>();
  return [...enumerateConfigs()].map((entry) => {
    const path = `${entry.folder}/${entry.name}`;
    const key = resultKey(entry);
    const sameAs = first.get(key);
    if (sameAs === undefined) first.set(key, path);
    return { ...entry, path, sameAs };
  });
}

export const LAB_ENTRIES = entries();
export const LAB_FOLDERS = [...new Set(LAB_ENTRIES.map((entry) => entry.folder))];

export const lab = reactive({
  /** Which utterance the batch runs over. */
  source: "reference" as "reference" | "take",
  /** What the results on screen were made from. */
  title: "",
  samples: 0,
  isReference: false,

  running: false,
  done: 0,
  total: 0,
  /** Results by entry path; an entry that is the same as another shares that one's. Each is marked raw. */
  results: {} as Record<string, LabResult>,

  /** The folder in view, or all of them. */
  folder: "all",
  /** Up to two entries picked for comparison. */
  picked: [] as string[],

  /** Entries packed into the export so far, while one is being made. */
  packing: null as { done: number; total: number } | null,
});
