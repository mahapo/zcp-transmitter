// What the GNU Radio app made of the reference utterance, per catalog entry, as
// sizes and hashes: enough to tell whether this chain reproduces the catalog
// without its 1.4 GB of IQ files. reference.json was made from those files and
// is the record of them here.
import { onsets } from "../dsp/analysis.ts";
import { AUDIO_RATE, CATALOG_RATE } from "../dsp/config.ts";
import { sha256Hex } from "../lib/hash.ts";

export interface ReferenceEntry {
  /** Folder and name as in the catalog, e.g. "signal_conditioning/notch". */
  path: string;
  /** Size and SHA-256 of the catalog's .iq file. */
  iqBytes: number;
  iq: string;
  /** Length of the pulse train in the file and its SHA-256, see `trainBytes`. */
  trainSamples: number;
  train: string;
  /** The same for the leading part that ends where the filtered speech does. */
  speechSamples: number;
  speech: string;
  /** Pulses in the whole train. */
  onsets: number;
}

export interface Reference {
  /** The reference utterance: its length at 48 kHz and the SHA-256 of its float32 samples. */
  audioSamples: number;
  audio: string;
  entries: ReferenceEntry[];
}

/** "speech": equal until the speech has ended, with as many pulses after it. */
export type Match = "identical" | "speech" | "different";

/** The first `length` samples of a pulse train as one byte each, 1 during a pulse. This is what gets hashed. */
export function trainBytes(pulses: Float32Array, length = pulses.length): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let n = 0; n < length; n++) if (pulses[n] > 0) bytes[n] = 1;
  return bytes;
}

/** The pulse train held in interleaved complex64 IQ at `rate`, undoing the sample-and-hold of resample.ts. */
export function trainFromIq(iq: Float32Array, rate = CATALOG_RATE): Float32Array {
  const train = new Float32Array(Math.floor(((iq.length / 2) * AUDIO_RATE) / rate));
  for (let n = 0; n < train.length; n++) if (iq[2 * Math.ceil((n * rate) / AUDIO_RATE)] > 0) train[n] = 1;
  return train;
}

/** How the pulse train this chain made of the reference utterance compares with the catalog's. */
export async function matchReference(pulses: Float32Array, entry: ReferenceEntry): Promise<Match> {
  if (pulses.length !== entry.trainSamples) return "different";
  if ((await sha256Hex(trainBytes(pulses))) === entry.train) return "identical";
  const speech = await sha256Hex(trainBytes(pulses, entry.speechSamples));
  return speech === entry.speech && onsets(pulses).length === entry.onsets ? "speech" : "different";
}

/** Whether `audio` is the utterance the catalog was made from. */
export async function isReferenceAudio(audio: Float32Array, reference: Reference): Promise<boolean> {
  return audio.length === reference.audioSamples && (await sha256Hex(audio)) === reference.audio;
}

/** The reference data, fetched when first needed. */
export async function loadReference(): Promise<Reference> {
  return (await import("./reference.json")).default;
}
