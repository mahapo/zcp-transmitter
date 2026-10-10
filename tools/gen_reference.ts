// Writes src/catalog/reference.json from the catalog's .iq files, so that tests
// and the app can check the chain against GNU Radio's output without them.
//   node tools/gen_reference.ts
import { readFileSync, writeFileSync } from "node:fs";
import { type Reference, type ReferenceEntry, trainBytes, trainFromIq } from "../src/catalog/reference.ts";
import { onsets } from "../src/dsp/analysis.ts";
import { CATALOG_RATE, enumerateConfigs } from "../src/dsp/config.ts";
import { toIq } from "../src/dsp/resample.ts";
import { decodeWav } from "../src/dsp/wav.ts";
import { sha256Hex } from "../src/lib/hash.ts";

// The delay of the two main filters at their default settings (2313 and 579 taps).
const FILTER_DELAY = (2313 - 1) / 2 + (579 - 1) / 2;

const catalog = new URL("../Combination_Catalog/", import.meta.url);
const audio = decodeWav(readFileSync(new URL("_tts/tts_48k.wav", catalog))).samples;
// Where the filtered audio ends; past it the chain only amplifies rounding residue.
const audioEnd = audio.findLastIndex((sample) => sample !== 0) + 1 + FILTER_DELAY;

const entries: ReferenceEntry[] = [];
for (const { folder, name } of enumerateConfigs()) {
  const path = `${folder}/${name}`;
  const file = readFileSync(new URL(`${path}.iq`, catalog));
  const iq = new Float32Array(file.buffer, file.byteOffset, file.byteLength / 4);
  const train = trainFromIq(iq);

  // The hashes of the train stand in for the file only if the file is nothing but that train, held.
  const iqHash = await sha256Hex(file);
  if ((await sha256Hex(toIq(train, CATALOG_RATE, "cf32"))) !== iqHash) {
    throw new Error(`${path}.iq is not a held pulse train`);
  }

  // Filters that drop their first outputs shorten the train from the front.
  const speechSamples = Math.min(train.length, audioEnd - (audio.length - train.length));
  entries.push({
    path,
    iqBytes: file.byteLength,
    iq: iqHash,
    trainSamples: train.length,
    train: await sha256Hex(trainBytes(train)),
    speechSamples,
    speech: await sha256Hex(trainBytes(train, speechSamples)),
    onsets: onsets(train).length,
  });
}

const reference: Reference = { audioSamples: audio.length, audio: await sha256Hex(audio), entries };
const lines = entries.map((entry) => `    ${JSON.stringify(entry)}`).join(",\n");
const json = `{\n  "audioSamples": ${reference.audioSamples},\n  "audio": "${reference.audio}",\n  "entries": [\n${lines}\n  ]\n}\n`;
writeFileSync(new URL("../src/catalog/reference.json", import.meta.url), json);
console.log(`${entries.length} entries written`);
