// The history keeps audio as the chain got it and makes room by dropping the oldest unpinned takes.
import "fake-indexeddb/auto";
import { beforeEach, expect, test, vi } from "vitest";
import { appDefaults, catalogBaseline } from "../src/dsp/config.ts";
import { MAX_TAKES, addTake, clearTakes, listTakes, loadAudio, removeTake, setPinned } from "../src/session/history.ts";
import { loadPresets, removePreset, savePreset } from "../src/session/presets.ts";

const take = (title: string, created: number) => ({ title, created, config: appDefaults(), seconds: 1, pulses: 10, duty: 0.03 });

beforeEach(async () => {
  for (const each of await listTakes()) await removeTake(each.id);
});

test("audio comes back sample for sample, and newest takes come first", async () => {
  const audio = Float32Array.from({ length: 1000 }, (_, n) => Math.sin(n) / 3);
  await addTake(take("first", 1), audio);
  const takes = await addTake(take("second", 2), new Float32Array(10));
  expect(takes.map((each) => each.title)).toEqual(["second", "first"]);
  expect(takes[1]).toMatchObject({ bytes: 4000, pinned: false, config: appDefaults() });
  expect(await loadAudio(takes[1].id)).toEqual(audio);
  // The stored copy is the history's own.
  audio.fill(0);
  expect((await loadAudio(takes[1].id))![1]).not.toBe(0);
});

test("beyond the limit the oldest go, but never a pinned one", async () => {
  const [oldest] = await addTake(take("keep me", 0), new Float32Array(4));
  await setPinned(oldest.id, true);
  for (let n = 1; n <= MAX_TAKES + 3; n++) await addTake(take(`take ${n}`, n), new Float32Array(4));
  const takes = await listTakes();
  expect(takes.length).toBe(MAX_TAKES + 1);
  expect(takes.at(-1)).toMatchObject({ title: "keep me", pinned: true });
  expect(takes[0].title).toBe(`take ${MAX_TAKES + 3}`);
  expect(takes.some((each) => each.title === "take 1")).toBe(false);
  expect(await loadAudio(oldest.id)).toBeDefined();

  await clearTakes();
  expect((await listTakes()).map((each) => each.title)).toEqual(["keep me"]);
});

test("one large take pushes out older ones but stays itself", async () => {
  await addTake(take("small", 1), new Float32Array(4));
  const takes = await addTake(take("huge", 2), new Float32Array(51e6)); // 204 MB, over the limit alone
  expect(takes.map((each) => each.title)).toEqual(["huge"]);
});

test("presets are stored by name and made valid when read", () => {
  const stored = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value) });
  expect(loadPresets()).toEqual([]);
  let presets = savePreset([], "Speech", appDefaults());
  presets = savePreset(presets, "Bare", catalogBaseline());
  presets = savePreset(presets, "Speech", { ...appDefaults(), pulseUs: 50 });
  expect(presets.map(({ name }) => name)).toEqual(["Bare", "Speech"]);
  expect(loadPresets()).toEqual(presets);
  expect(loadPresets()[1].config.pulseUs).toBe(50);
  expect(removePreset(presets, "Bare").map(({ name }) => name)).toEqual(["Speech"]);

  // Someone edited the storage by hand.
  stored.set("zcp:presets:v1", JSON.stringify([{ name: "Odd", config: { filters: { schmitt: true, hilbert: true }, pulseUs: 9999 } }, { name: "" }, 7, null]));
  expect(loadPresets()).toEqual([{ name: "Odd", config: { ...catalogBaseline(), filters: { ...catalogBaseline().filters, hilbert: true }, pulseUs: 150 } }]);
  stored.set("zcp:presets:v1", "not json");
  expect(loadPresets()).toEqual([]);
  vi.unstubAllGlobals();
});
