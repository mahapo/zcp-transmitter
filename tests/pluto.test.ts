// The AD936x transmitter must stay at the lowest level until it streams, and
// both it and the receiver must leave the board as they found it.
import { expect, test } from "vitest";
import { MAX_ATTENUATION_DB, PlutoRx, PlutoTx, RX_OFFSET_HZ } from "../src/sdr/pluto.ts";
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

// --- the receiver ---------------------------------------------------------------

const RX_LO = "ad9361-phy OUTPUT altvoltage0";
const RX_CHANNEL = "ad9361-phy INPUT voltage0";
const RX = "cf-ad9361-lpc";

const receiverBoard = () => ({
  [`${RX_LO} frequency`]: "2400000000",
  [`${RX_CHANNEL} gain_control_mode`]: "slow_attack",
  [`${RX_CHANNEL} hardwaregain`]: "71.000000 dB",
  [`${RX_CHANNEL} rf_bandwidth`]: "18000000",
  [`${RX_CHANNEL} sampling_frequency`]: "30720000",
});

test("the receiver tunes below the carrier, reads blocks and restores the board", async () => {
  const { client, log, attrs } = fakeIiod(receiverBoard(), { samples: (bytes) => Uint8Array.from({ length: bytes }, (_, n) => n % 251) });
  const rx = new PlutoRx(client, client);

  expect(await rx.start({ frequency: 1300e6, gain: 20, ownsRate: true })).toEqual({ sampleRate: 2_500_000, blockSamples: 125_000, fullScale: 2048 });
  expect(log.splice(0)).toEqual([
    `WRITE ${RX_CHANNEL} sampling_frequency = 2500000`,
    `WRITE ${RX_CHANNEL} rf_bandwidth = 2000000`,
    `WRITE ${RX_CHANNEL} gain_control_mode = manual`,
    `WRITE ${RX_CHANNEL} hardwaregain = 20`,
    `WRITE ${RX_LO} frequency = ${1300e6 - RX_OFFSET_HZ}`,
    `OPEN ${RX} 125000 00000003`,
  ]);

  const block = await rx.read();
  expect(block.length).toBe(250_000); // I and Q of every sample
  expect(Array.from(block.subarray(0, 2))).toEqual([0x0100, 0x0302]); // little-endian pairs of the bytes 0, 1, 2, 3
  await rx.setGain(35);
  expect(log.splice(0)).toEqual([`READBUF ${RX} 500000`, `WRITE ${RX_CHANNEL} hardwaregain = 35`]);

  await rx.stop();
  // The gain goes back while it can still be set by hand, the mode after it.
  expect(log.splice(0)).toEqual([
    `CLOSE ${RX}`,
    `WRITE ${RX_LO} frequency = 2400000000`,
    `WRITE ${RX_CHANNEL} rf_bandwidth = 18000000`,
    `WRITE ${RX_CHANNEL} hardwaregain = 71`,
    `WRITE ${RX_CHANNEL} gain_control_mode = slow_attack`,
    `WRITE ${RX_CHANNEL} sampling_frequency = 30720000`,
  ]);
  expect(Object.fromEntries(attrs)).toEqual({ ...receiverBoard(), [`${RX_CHANNEL} hardwaregain`]: "71" });
  await rx.stop();
  expect(log).toEqual([]);
});

test("alongside the transmitter the receiver leaves the sample rate alone", async () => {
  const { client, log } = fakeIiod({ ...receiverBoard(), [`${RX_CHANNEL} sampling_frequency`]: "2500000" });
  const rx = new PlutoRx(client, client);
  await rx.start({ frequency: 1300e6, gain: 20, ownsRate: false });
  await rx.stop();
  expect(log.filter((line) => line.includes("sampling_frequency"))).toEqual([]);
});

test("a receiver that cannot start restores the board", async () => {
  const { client, attrs } = fakeIiod(receiverBoard(), { fail: (line) => (line.startsWith("OPEN") ? 16 : undefined) });
  const rx = new PlutoRx(client, client);
  await expect(rx.start({ frequency: 1300e6, gain: 20, ownsRate: true })).rejects.toThrow("errno 16");
  expect(Object.fromEntries(attrs)).toEqual({ ...receiverBoard(), [`${RX_CHANNEL} hardwaregain`]: "71" });
  // Nothing is written to a receiver that is not running.
  await rx.setGain(10);
  expect(attrs.get(`${RX_CHANNEL} hardwaregain`)).toBe("71");
});
