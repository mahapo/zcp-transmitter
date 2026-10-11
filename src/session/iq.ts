// The IQ file of a pulse train: complex64 at 2 MS/s, I = pulses at half scale, Q = 0, as in the catalog.
import { AUDIO_RATE, CATALOG_RATE } from "../dsp/config.ts";
import { IqHolder, outputLength } from "../dsp/resample.ts";

/** The file's contents one second at a time, so a long recording is never one giant array. */
export function catalogIq(pulses: Float32Array): Float32Array[] {
  const holder = new IqHolder(CATALOG_RATE, "cf32");
  const parts: Float32Array[] = [];
  for (let start = 0; start < pulses.length; start += AUDIO_RATE) {
    const second = pulses.subarray(start, Math.min(pulses.length, start + AUDIO_RATE));
    parts.push(holder.render(second, outputLength(second.length, CATALOG_RATE)) as Float32Array);
  }
  return parts;
}

/** The size of that file in bytes. */
export function catalogIqBytes(pulseSamples: number): number {
  return 8 * outputLength(pulseSamples, CATALOG_RATE);
}
