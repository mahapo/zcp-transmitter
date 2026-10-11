// Comparing pulse trains, for the Catalog Lab and the receive monitor.
import { expect, test } from "vitest";
import { onsets, pulseEdges, pulsesFromEdges } from "../src/dsp/analysis.ts";
import { ZcpChain } from "../src/dsp/chain.ts";
import { compareLoopback, compareOnsets } from "../src/dsp/compare.ts";
import { appDefaults, catalogBaseline, noFilters } from "../src/dsp/config.ts";
import { LAB_ENTRIES } from "../src/state/lab.ts";
import { referenceUtterance } from "./helpers/utterance.ts";

test("a pulse train and its edges convert both ways", () => {
  for (const pulses of [Float32Array.of(0, 1, 1, 0, 0, 1, 0), Float32Array.of(1, 1, 0, 1), Float32Array.of(0, 0, 1, 1), new Float32Array(5), Float32Array.of(1)]) {
    expect(pulsesFromEdges(pulseEdges(pulses), pulses.length)).toEqual(pulses);
  }
  expect(Array.from(pulseEdges(Float32Array.of(0, 1, 1, 0, 0, 1, 0)))).toEqual([1, 3, 5, 6]);
  // Edges on a time axis three samples later, taken back to the train's own.
  expect(pulsesFromEdges(Uint32Array.of(4, 6, 8, 9), 7, 3)).toEqual(Float32Array.of(0, 1, 1, 0, 0, 1, 0));

  const real = new ZcpChain(appDefaults()).process(referenceUtterance());
  const edges = pulseEdges(real);
  expect(pulsesFromEdges(edges, real.length)).toEqual(real);
  expect(edges.filter((_, index) => index % 2 === 0)).toEqual(Uint32Array.from(onsets(real)));
});

test("equal trains match pulse for pulse", () => {
  const a = [10, 50, 90, 200, 260];
  expect(compareOnsets(a, a)).toEqual({ lag: 0, matched: 5, onlyA: 0, onlyB: 0 });
  expect(compareOnsets(a, [])).toEqual({ lag: 0, matched: 0, onlyA: 5, onlyB: 0 });
  expect(compareOnsets([], a, 1, 100)).toEqual({ lag: 0, matched: 0, onlyA: 0, onlyB: 5 });
});

test("missing and extra pulses are told apart", () => {
  const a = [10, 50, 90, 200, 260];
  const b = [10, 51, 120, 200, 260, 400];
  expect(compareOnsets(a, b, 1)).toEqual({ lag: 0, matched: 4, onlyA: 1, onlyB: 2 });
  expect(compareOnsets(a, b, 0)).toEqual({ lag: 0, matched: 3, onlyA: 2, onlyB: 3 });
});

test("a shift between the trains is found and taken out", () => {
  const a = Array.from({ length: 200 }, (_, n) => 37 * n + ((n * 7) % 11));
  const later = a.map((at) => at + 578);
  expect(compareOnsets(a, later, 1, 2400)).toEqual({ lag: 578, matched: 200, onlyA: 0, onlyB: 0 });
  expect(compareOnsets(later, a, 1, 2400)).toEqual({ lag: -578, matched: 200, onlyA: 0, onlyB: 0 });
  // Without leave to shift, hardly anything lines up.
  expect(compareOnsets(a, later, 1).matched).toBeLessThan(20);
  // A few pulses lost on the way do not disturb the shift.
  const lossy = later.filter((_, n) => n % 9 !== 0);
  expect(compareOnsets(a, lossy, 1, 2400)).toEqual({ lag: 578, matched: lossy.length, onlyA: 200 - lossy.length, onlyB: 0 });
});

test("the F1 band-pass shows up as its delay", () => {
  const audio = referenceUtterance();
  const starts = (filters: object) => {
    const pulses = new ZcpChain({ ...catalogBaseline(), filters: { ...noFilters(), ...filters } }).process(audio);
    const skipped = audio.length - pulses.length;
    return onsets(pulses).map((at) => at + skipped);
  };
  // The filter's own delay; its pulses are different ones, so only the shift is telling.
  expect(Math.abs(compareOnsets(starts({}), starts({ f1Bandpass: true }), 1, 2400).lag - 578)).toBeLessThan(40);
});

test("the lab runs each distinct result once", () => {
  const distinct = LAB_ENTRIES.filter((entry) => entry.sameAs === undefined);
  expect(LAB_ENTRIES.length).toBe(74);
  expect(distinct.length).toBe(56);
  const same = Object.fromEntries(LAB_ENTRIES.filter((entry) => entry.sameAs).map((entry) => [entry.path, entry.sameAs]));
  expect(same["signal_conditioning/de_emph"]).toBe("_baseline/baseline");
  expect(same["slider_sweeps/hpf/hpf_100hz"]).toBe("_baseline/baseline");
  expect(same["slider_sweeps/lpf/lpf_2300hz"]).toBe("_baseline/baseline");
  expect(same["signal_conditioning/notch+de_emph+decimate"]).toBe("signal_conditioning/notch+decimate");
  // Entries that share a run really do give the same pulses.
  const audio = referenceUtterance();
  for (const path of ["signal_conditioning/de_emph+fricative", "slider_sweeps/hpf/hpf_100hz"]) {
    const entry = LAB_ENTRIES.find((each) => each.path === path)!;
    const other = LAB_ENTRIES.find((each) => each.path === entry.sameAs)!;
    expect(new ZcpChain(entry.config).process(audio)).toEqual(new ZcpChain(other.config).process(audio));
  }
});

test("what came back is held against what was sent, whenever each record began", () => {
  const sent = Array.from({ length: 150 }, (_, n) => 5000 + 41 * n + ((n * 13) % 17));
  // The receiver's record starts earlier and ends later, and hears everything 90 ms late.
  const before = [100, 900, 2000];
  const after = [200_000, 201_000];
  const heard = (list: number[]) => [...before, ...list.map((at) => at + 4320), ...after];
  expect(compareLoopback(sent, heard(sent), 2, 144_000)).toEqual({ lag: 4320, matched: 150, onlyA: 0, onlyB: 0 });
  // Five pulses lost on the way and one that was never sent.
  const lossy = sent.filter((_, n) => n % 30 !== 7);
  const withExtra = [...lossy.slice(0, 60), lossy[59] + 20, ...lossy.slice(60)];
  expect(compareLoopback(sent, heard(withExtra), 2, 144_000)).toEqual({ lag: 4320, matched: 145, onlyA: 5, onlyB: 1 });
  expect(compareLoopback([], heard(sent), 2, 144_000)).toEqual({ lag: 0, matched: 0, onlyA: 0, onlyB: 0 });
  expect(compareLoopback(sent, [], 2, 144_000)).toMatchObject({ matched: 0, onlyA: 150, onlyB: 0 });
});
