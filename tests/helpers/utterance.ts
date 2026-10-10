import { readFileSync } from "node:fs";
import { decodeWav } from "../../src/dsp/wav.ts";

/** The utterance the catalog was made from ("Test", 48 kHz, padded); it ships with the app. */
export function referenceUtterance(): Float32Array {
  return decodeWav(readFileSync(new URL("../../public/samples/test-48k.wav", import.meta.url))).samples;
}
