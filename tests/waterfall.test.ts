// The rolling waterfall must show a stream exactly as the catalog's
// spectrogram shows a finished utterance, however the stream is cut into blocks.
import { expect, test } from "vitest";
import { ZcpChain } from "../src/dsp/chain.ts";
import { appDefaults } from "../src/dsp/config.ts";
import { FFT_SIZE, SILENCE_DB, analyse } from "../src/dsp/spectrogram.ts";
import { FULL_PULSE_DB, ROLLING_COLUMN_SECONDS, RollingWaterfall, levelByte } from "../src/dsp/waterfall.ts";
import { referenceUtterance } from "./helpers/utterance.ts";

/** Every frame of `pulses` as its own column, fed in blocks of `block` samples. */
function roll(pulses: Float32Array, block: number, framesPerColumn = 1): Float32Array[] {
  const columns: Float32Array[] = [];
  const rolling = new RollingWaterfall(framesPerColumn, (db) => columns.push(db.slice()));
  for (let start = 0; start < pulses.length; start += block) rolling.push(pulses.subarray(start, start + block));
  return columns;
}

// The static analysis starts at the first pulse less a margin; a pulse at the very start makes both start at zero.
const pulses = new ZcpChain(appDefaults()).process(referenceUtterance()).subarray(0, 24000);
pulses[0] = 1;
const expected = analyse(pulses)!;

test.each([24000, 2400, 480, 7])("frames in blocks of %i samples equal the static ones", (block) => {
  expect(expected.start).toBe(0);
  const columns = roll(pulses, block);
  expect(columns.length).toBeGreaterThanOrEqual(expected.frames);
  let differing = 0;
  for (let frame = 0; frame < expected.frames; frame++) {
    for (let bin = 0; bin < FFT_SIZE; bin++) if (!Object.is(columns[frame][bin], expected.db[frame * FFT_SIZE + bin])) differing++;
  }
  expect(differing).toBe(0);
});

test("a column holds the strongest of its frames", () => {
  const frames = roll(pulses, 2400);
  const columns = roll(pulses, 2400, 250);
  expect(columns.length).toBe(Math.floor(frames.length / 250));
  columns.forEach((column, index) => {
    for (let bin = 0; bin < FFT_SIZE; bin += 9) {
      let strongest = SILENCE_DB;
      for (let frame = 250 * index; frame < 250 * (index + 1); frame++) strongest = Math.max(strongest, frames[frame][bin]);
      expect(column[bin]).toBe(strongest);
    }
  });
  expect(ROLLING_COLUMN_SECONDS).toBe(0.004);
});

test("levels run from silence to a frame that is all pulse", () => {
  expect(levelByte(SILENCE_DB)).toBe(0);
  expect(levelByte(FULL_PULSE_DB)).toBe(255);
  expect(levelByte(FULL_PULSE_DB + 3)).toBe(255);
  // The strongest frame of real pulses is one that lies inside a pulse.
  expect(expected.maxDb).toBeCloseTo(FULL_PULSE_DB, 6);
});
