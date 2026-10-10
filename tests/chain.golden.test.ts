// The chain must reproduce the reference catalog: every .iq file in
// Combination_Catalog/ was made by the GNU Radio app from the same utterance.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { ZcpChain } from "../src/dsp/chain.ts";
import { AMPLITUDE, CATALOG_RATE, catalogBaseline, enumerateConfigs } from "../src/dsp/config.ts";
import { IqHolder, PulseQueue, outputLength, toIq } from "../src/dsp/resample.ts";
import { decodeWav, prepareUtterance } from "../src/dsp/wav.ts";

const catalog = new URL("../Combination_Catalog/", import.meta.url);
const utterance = new URL("_tts/tts_48k.wav", catalog);

/** Sample indices at which a pulse train switches on. */
function onsets(pulses: Float32Array): number[] {
  const found: number[] = [];
  for (let n = 0; n < pulses.length; n++) if (pulses[n] > 0 && !(pulses[n - 1] > 0)) found.push(n);
  return found;
}

describe.skipIf(!existsSync(utterance))("reference catalog", () => {
  const audio = decodeWav(readFileSync(utterance)).samples;
  // Where the filtered audio ends: the last non-zero sample plus the delay of the two main filters.
  const audioEnd = audio.findLastIndex((sample) => sample !== 0) + 1 + (2313 - 1) / 2 + (579 - 1) / 2;
  const entries = [...enumerateConfigs()];
  let identical = 0;

  test.each(entries.map((entry) => [`${entry.folder}/${entry.name}`, entry.config] as const))("%s", (path, config) => {
    // complex64: the signal is in the even floats, the odd ones are zero.
    const file = readFileSync(new URL(`${path}.iq`, catalog));
    const expected = new Float32Array(file.buffer, file.byteOffset, file.byteLength / 4);

    const pulses = new ZcpChain(config).process(audio);
    const actual = toIq(pulses, CATALOG_RATE, "cf32");
    expect(actual.length).toBe(expected.length);

    let differing = 0;
    for (let n = 0; n < expected.length; n++) if (actual[n] !== expected[n]) differing++;
    if (differing === 0) {
      identical++;
      return;
    }

    // Past the end of the audio the chain amplifies rounding residue (below
    // -170 dB), so single pulses there may sit elsewhere than GNU Radio's.
    // Everything before must match, and so must the number of pulses.
    const reference = new Float32Array(pulses.length);
    for (let n = 0; n < reference.length; n++) reference[n] = expected[2 * Math.ceil((n * CATALOG_RATE) / 48000)] > 0 ? 1 : 0;
    const speech = audioEnd - (audio.length - pulses.length);
    expect(pulses.subarray(0, speech)).toEqual(reference.subarray(0, speech));
    expect(onsets(pulses).length).toBe(onsets(reference).length);
  });

  test("an eSpeak recording is prepared exactly as the reference prepares it", () => {
    const raw = decodeWav(readFileSync(new URL("_tts/raw.wav", catalog)));
    expect(prepareUtterance(raw)).toEqual(audio);
  });

  test("most files are reproduced bit for bit", () => {
    expect(entries.length).toBe(74);
    expect(identical).toBeGreaterThanOrEqual(56);
  });
});

test("chunked resampling equals one pass", () => {
  const pulses = Float32Array.from({ length: 4801 }, (_, n) => (n % 7 < 2 ? 1 : 0));
  for (const [rate, format, chunk] of [[2_500_000, "s16", 250_000], [2_000_000, "s8", 131_072]] as const) {
    const whole = toIq(pulses, rate, format);
    const holder = new IqHolder(rate, format);
    const queue = new PulseQueue();
    queue.push(pulses);
    let differing = 0;
    for (let done = 0; queue.length > 0; done += chunk) {
      // The queue pads the last chunk with silence, as the transmitter does.
      const part = holder.render(queue.pull(holder.inputNeeded(chunk)), chunk);
      for (let n = 0; n < part.length; n++) if (part[n] !== (whole[2 * done + n] ?? 0)) differing++;
    }
    expect(differing).toBe(0);
  }
});

test("pulses sit at half scale on I, Q stays zero", () => {
  const iq = toIq(Float32Array.of(0, 1, 0), CATALOG_RATE, "cf32");
  expect(iq.length).toBe(2 * outputLength(3, CATALOG_RATE));
  expect(new Set(iq)).toEqual(new Set([0, AMPLITUDE]));
  expect(iq.filter((_, n) => n % 2 === 1).every((q) => q === 0)).toBe(true);
  expect(new ZcpChain(catalogBaseline()).process(new Float32Array(480)).every((p) => p === 0)).toBe(true);
});
