// Receive IQ samples from an AD936x board and report their level.
//   node cli/rx.ts               keep the current tuning
//   node cli/rx.ts 433.92e6      tune the RX LO first (Hz)
//   node cli/rx.ts 433.92e6 2    listen for 2 s and also report pulses and duty cycle
import { toInt16 } from "../src/sdr/iiod/client.ts";
import { connectTcp } from "./tcp.ts";

const PHY = "ad9361-phy";
const RX = "cf-ad9361-lpc";
const RX_LO = { id: "altvoltage0", output: true };
const RX_CHANNEL = { id: "voltage0", output: false };
const SAMPLES = 16384;
const BLOCK_SAMPLES = 1 << 18; // per read when listening for longer
const BYTES_PER_SAMPLE = 4; // 16-bit I + 16-bit Q
const FULL_SCALE = 2048; // 12-bit ADC

const [tune, secondsArg] = process.argv.slice(2);
const seconds = Number(secondsArg ?? 0);
if (!(seconds >= 0)) {
  console.error("usage: node cli/rx.ts [frequencyHz] [seconds]");
  process.exit(1);
}

const sdr = await connectTcp();
try {
  console.log("iiod", await sdr.version());

  if (tune) await sdr.writeAttr(PHY, "frequency", Math.round(Number(tune)), RX_LO);

  const sampleRateHz = Number(await sdr.readAttr(PHY, "sampling_frequency", RX_CHANNEL));
  console.log({
    loHz: Number(await sdr.readAttr(PHY, "frequency", RX_LO)),
    sampleRateHz,
    bandwidthHz: Number(await sdr.readAttr(PHY, "rf_bandwidth", RX_CHANNEL)),
    gainMode: await sdr.readAttr(PHY, "gain_control_mode", RX_CHANNEL),
    gain: await sdr.readAttr(PHY, "hardwaregain", RX_CHANNEL),
    rssi: await sdr.readAttr(PHY, "rssi", RX_CHANNEL),
  });

  const wanted = seconds > 0 ? Math.round(sampleRateHz * seconds) : SAMPLES;
  const block = Math.min(wanted, BLOCK_SAMPLES);
  const iq = new Int16Array(Math.ceil(wanted / block) * block * 2);
  await sdr.openBuffer(RX, block, 0b11);
  try {
    for (let filled = 0; filled < iq.length; filled += block * 2) {
      iq.set(toInt16(await sdr.readBuffer(RX, block * BYTES_PER_SAMPLE)), filled);
    }
  } finally {
    await sdr.closeBuffer(RX);
  }

  const magnitude = new Float32Array(iq.length / 2);
  let power = 0;
  let peak = 0;
  for (let n = 0; n < magnitude.length; n++) {
    magnitude[n] = Math.hypot(iq[2 * n], iq[2 * n + 1]);
    power += magnitude[n] ** 2;
    peak = Math.max(peak, magnitude[n]);
  }
  const dbfs = (level: number) => (20 * Math.log10(level / FULL_SCALE)).toFixed(1);
  console.log(`${magnitude.length} samples, ${dbfs(Math.sqrt(power / magnitude.length))} dBFS`);
  console.log("first IQ pairs:", Array.from(iq.subarray(0, 8)).join(" "));

  if (seconds > 0) {
    // Count what rises above half the strongest sample: meaningful only when pulses stand clear of the noise.
    let above = 0;
    let pulses = 0;
    for (let n = 0; n < magnitude.length; n++) {
      if (magnitude[n] <= peak / 2) continue;
      above++;
      if (n === 0 || magnitude[n - 1] <= peak / 2) pulses++;
    }
    console.log(
      `peak ${dbfs(peak)} dBFS, ${pulses} pulses above half the peak, duty cycle ${((100 * above) / magnitude.length).toFixed(2)} %`,
    );
  }
} finally {
  sdr.close();
}
