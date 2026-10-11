// The chain must reproduce what GNU Radio made of the reference utterance:
// src/catalog/reference.json holds the size and hashes of each of its 74 files.
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { type Match, type Reference, isReferenceAudio, matchReference } from "../src/catalog/reference.ts";
import { ZcpChain } from "../src/dsp/chain.ts";
import { CATALOG_RATE, enumerateConfigs } from "../src/dsp/config.ts";
import { toIq } from "../src/dsp/resample.ts";
import { sha256Hex } from "../src/lib/hash.ts";
import { referenceUtterance } from "./helpers/utterance.ts";

const reference: Reference = JSON.parse(readFileSync(new URL("../src/catalog/reference.json", import.meta.url), "utf8"));
const configs = new Map([...enumerateConfigs()].map((entry) => [`${entry.folder}/${entry.name}`, entry.config]));
const audio = referenceUtterance();
const matches: Match[] = [];

test("the sample that ships with the app is the reference utterance", async () => {
  expect(await isReferenceAudio(audio, reference)).toBe(true);
});

test("the reference covers the whole catalog", () => {
  expect(reference.entries.map((entry) => entry.path)).toEqual([...configs.keys()]);
});

test.each(reference.entries.map((entry) => [entry.path, entry] as const))("%s", async (path, entry) => {
  const pulses = new ZcpChain(configs.get(path)!).process(audio);
  const match = await matchReference(pulses, entry);
  expect(match).not.toBe("different");
  matches.push(match);
  if (match !== "identical") return;

  // An identical pulse train makes the very file of the catalog.
  const iq = toIq(pulses, CATALOG_RATE, "cf32");
  expect(iq.byteLength).toBe(entry.iqBytes);
  expect(await sha256Hex(iq)).toBe(entry.iq);
});

test("most files are reproduced bit for bit", () => {
  expect(matches.filter((match) => match === "identical").length).toBeGreaterThanOrEqual(56);
});
