// The AD936x transmitter must stay at the lowest level until it streams, and
// leave the board as it found it.
import { expect, test } from "vitest";
import { MAX_ATTENUATION_DB, PlutoTx } from "../src/sdr/pluto.ts";
import { fakeIiod } from "./helpers/fakeIiod.ts";

const LO = "ad9361-phy OUTPUT altvoltage1";
const CHANNEL = "ad9361-phy OUTPUT voltage0";
const TX = "cf-ad9361-dds-core-lpc";

const board = () => ({
  [`${LO} frequency`]: "2450000000",
  [`${LO} powerdown`]: "1",
  [`${CHANNEL} hardwaregain`]: "-10.000000 dB",
  [`${CHANNEL} sampling_frequency`]: "30720000",
  [`${CHANNEL} rf_bandwidth`]: "18000000",
});

const RESTORED = [
  `WRITE ${CHANNEL} hardwaregain = ${MAX_ATTENUATION_DB}`,
  `CLOSE ${TX}`,
  `WRITE ${LO} frequency = 2450000000`,
  `WRITE ${LO} powerdown = 1`,
  `WRITE ${CHANNEL} sampling_frequency = 30720000`,
  `WRITE ${CHANNEL} rf_bandwidth = 18000000`,
  `WRITE ${CHANNEL} hardwaregain = -10`,
];

test("tunes at the lowest level, raises it once samples flow, and restores the board", async () => {
  const { client, log } = fakeIiod(board());
  const tx = new PlutoTx(client);

  expect(await tx.start({ frequency: 1300e6, gain: -40 })).toEqual({ sampleRate: 2_500_000, chunkSamples: 250_000 });
  expect(log.splice(0)).toEqual([
    `WRITE ${CHANNEL} hardwaregain = ${MAX_ATTENUATION_DB}`,
    `WRITE ${CHANNEL} sampling_frequency = 2500000`,
    `WRITE ${CHANNEL} rf_bandwidth = 2000000`,
    `WRITE ${LO} powerdown = 0`,
    `WRITE ${LO} frequency = 1300000000`,
    `OPEN ${TX} 250000 00000003`,
  ]);

  await tx.write(new Int16Array(8));
  await tx.write(new Int16Array(8));
  expect(log.splice(0)).toEqual([`WRITEBUF ${TX} 16`, `WRITE ${CHANNEL} hardwaregain = -40`, `WRITEBUF ${TX} 16`]);

  await tx.setGain(-30);
  expect(log.splice(0)).toEqual([`WRITE ${CHANNEL} hardwaregain = -30`]);

  await tx.stop();
  expect(log.splice(0)).toEqual(RESTORED);
  await tx.stop();
  expect(log).toEqual([]);
});

test("a new level waits for the first samples", async () => {
  const { client, log } = fakeIiod(board());
  const tx = new PlutoTx(client);
  await tx.start({ frequency: 1300e6, gain: -40 });
  log.length = 0;
  await tx.setGain(-20);
  expect(log).toEqual([]);
  await tx.write(new Int16Array(8));
  expect(log).toEqual([`WRITEBUF ${TX} 16`, `WRITE ${CHANNEL} hardwaregain = -20`]);
});

test("a start that fails goes quiet and restores the board", async () => {
  const { client, log, attrs } = fakeIiod(board(), { fail: (line) => (line.startsWith("OPEN") ? 16 : undefined) });
  await expect(new PlutoTx(client).start({ frequency: 1300e6, gain: -40 })).rejects.toThrow("errno 16");
  expect(log.slice(-6)).toEqual(RESTORED.filter((line) => !line.startsWith("CLOSE")));
  expect(Object.fromEntries(attrs)).toEqual({ ...board(), [`${CHANNEL} hardwaregain`]: "-10" });
});

test("stopping tries every step and reports the first failure", async () => {
  const { client, log } = fakeIiod(board(), { fail: (line) => (line.startsWith("CLOSE") ? 9 : undefined) });
  const tx = new PlutoTx(client);
  await tx.start({ frequency: 1300e6, gain: -40 });
  log.length = 0;
  await expect(tx.stop()).rejects.toThrow("errno 9");
  expect(log).toEqual(RESTORED.filter((line) => !line.startsWith("CLOSE")));
});
