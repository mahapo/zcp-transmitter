// How the stages of the chain are named and explained in the flowgraph.
// Parameters are those of Combination_Catalog/REPROGRAM.md.
import type { StageId } from "../../dsp/chain.ts";
import { FILTERS, type FilterGroup, type FilterKey } from "../../dsp/config.ts";

export interface StageInfo {
  /** A stage of the chain, or the one filter that has none because it does nothing. */
  id: StageId | "deEmphasis";
  /** The name on the block and the full name. */
  short: string;
  name: string;
  about: string;
  /** Set for the optional filters. */
  filter?: FilterKey;
  group?: FilterGroup;
}

const fixed = (id: StageId, short: string, name: string, about: string): StageInfo => ({ id, short, name, about });

function optional(id: FilterKey, short: string, about: string): StageInfo {
  const { label, group } = FILTERS.find((filter) => filter.key === id)!;
  return { id, short, name: label, about, filter: id, group };
}

/** Every block of the flowgraph, in the order the signal passes them. */
export const STAGE_INFO: StageInfo[] = [
  fixed("input", "Input", "Input", "The audio as it arrives: mono, 48 kHz."),
  fixed("dcBlocker", "DC block", "DC Blocker", "Removes any constant offset, which would shift every zero crossing."),
  optional("notch", "Notch", "A narrow notch at 60 Hz mains hum, Q = 6."),
  fixed("hpf", "HPF", "High-pass", "FIR high-pass at the HPF slider, 50 Hz transition."),
  fixed("lpf", "LPF", "Low-pass", "FIR low-pass at the LPF slider, 200 Hz transition."),
  optional("f1Bandpass", "F1 band", "Keeps 300 to 900 Hz, where the first formant lies."),
  optional("fricative", "Fricative", "Turns down s, f and sh sounds, which cross zero far more often than voiced speech."),
  optional("preEmphasis", "Pre-emph", "Lifts the highs: y[n] = x[n] − 0.5·x[n−1]."),
  optional("deEmphasis", "De-emph", "Changes nothing, as in the original app: its GNU Radio filter ignores this setting."),
  fixed("agc", "AGC", "Automatic Gain Control", "Brings the level to 0.5 (rate 1e-4, gain up to 65536)."),
  optional("noiseGate", "Gate", "Mutes while the short-term power is below −30 dB."),
  optional("envelopeFollower", "Envelope", "Mutes while a 5 ms envelope is below its threshold."),
  optional("spectralSub", "Spectral", "Tracks the noise floor in quiet stretches and turns the signal down towards it."),
  optional("decimate", "Decimate", "A gentle 4 kHz low-pass, standing in for 48 → 8 kHz."),
  optional("halfWave", "Half-wave", "Replaces everything that is not positive with −0.05."),
  optional("schmitt", "Schmitt", "Hysteresis: snaps to ±0.5 at ±0.01, so noise near zero no longer triggers."),
  optional("hilbert", "Hilbert", "The envelope minus its slow mean: one crossing per syllable edge."),
  fixed("pulse", "ZCP", "Zero-Crossing Pulse", "Every zero crossing starts one pulse as long as the Pulse slider says."),
];

export function stageInfo(id: StageInfo["id"]): StageInfo {
  return STAGE_INFO.find((stage) => stage.id === id)!;
}
