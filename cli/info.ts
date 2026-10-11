// What an AD936x board reports about itself. It only reads; nothing is changed.
//   node cli/info.ts
import { IiodError } from "../src/sdr/iiod/client.ts";
import { connectTcp } from "./tcp.ts";

const PHY = "ad9361-phy";
const TX_LO = { id: "altvoltage1", output: true };
const TX_CHANNEL = { id: "voltage0", output: true };
const RX_LO = { id: "altvoltage0", output: true };
const RX_CHANNEL = { id: "voltage0", output: false };

const sdr = await connectTcp();
try {
  /** The value, or why there is none: boards differ in what they offer. */
  const read = (attr: string, channel?: { id: string; output: boolean }) =>
    sdr.readAttr(PHY, attr, channel).catch((error) => (error instanceof IiodError ? `(errno ${error.errno})` : Promise.reject(error)));
  console.log({
    iiod: await sdr.version(),
    tx: {
      loHz: await read("frequency", TX_LO),
      powerdown: await read("powerdown", TX_LO),
      gain: await read("hardwaregain", TX_CHANNEL),
      sampleRateHz: await read("sampling_frequency", TX_CHANNEL),
      bandwidthHz: await read("rf_bandwidth", TX_CHANNEL),
    },
    rx: {
      loHz: await read("frequency", RX_LO),
      gainMode: await read("gain_control_mode", RX_CHANNEL),
      gain: await read("hardwaregain", RX_CHANNEL),
      sampleRateHz: await read("sampling_frequency", RX_CHANNEL),
      bandwidthHz: await read("rf_bandwidth", RX_CHANNEL),
      rssi: await read("rssi", RX_CHANNEL),
    },
    // 0 = off, 1 = the chip feeds its transmit samples to its receiver. Shown for information; no tool here sets it.
    loopback: await sdr.readDebugAttr(PHY, "loopback").catch((error) => (error instanceof IiodError ? `not offered (errno ${error.errno})` : Promise.reject(error))),
  });
} finally {
  sdr.close();
}
