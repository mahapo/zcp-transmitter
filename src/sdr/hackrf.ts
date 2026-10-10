// HackRF One transmitter over WebUSB, speaking libhackrf's vendor requests.
import type { SdrDevice, SdrDriver } from "./device.ts";

// enum hackrf_vendor_request
const SET_TRANSCEIVER_MODE = 1;
const SAMPLE_RATE_SET = 6;
const BASEBAND_FILTER_BANDWIDTH_SET = 7;
const SET_FREQ = 16;
const AMP_ENABLE = 17;
const SET_TXVGA_GAIN = 21;

const MODE_OFF = 0;
const MODE_TRANSMIT = 2;
const TX_ENDPOINT = 2;
const SAMPLE_RATE = 2_000_000; // the rate of the original app and its catalog
const FILTER_BANDWIDTH = 1_750_000; // what libhackrf picks for 2 MS/s
const CHUNK_SAMPLES = 131072; // libhackrf's 262144-byte transfer
const MAX_TXVGA_DB = 47;

function words(...values: number[]): Uint8Array<ArrayBuffer> {
  const data = new DataView(new ArrayBuffer(4 * values.length));
  values.forEach((value, index) => data.setUint32(4 * index, value, true));
  return new Uint8Array(data.buffer);
}

export const hackrf: SdrDriver = {
  id: "hackrf",
  label: "HackRF One",
  usbFilters: [
    { vendorId: 0x1d50, productId: 0x6089 }, // HackRF One
    { vendorId: 0x1d50, productId: 0x604b }, // Jawbreaker
    { vendorId: 0x1d50, productId: 0xcc15 }, // rad1o
  ],
  async open(usb): Promise<SdrDevice> {
    await usb.open();
    if (usb.configuration === null) await usb.selectConfiguration(1);
    await usb.claimInterface(0);

    const send = async (request: number, value = 0, index = 0, data?: Uint8Array<ArrayBuffer>) => {
      const result = await usb.controlTransferOut({ requestType: "vendor", recipient: "device", request, value, index }, data);
      if (result.status !== "ok") throw new Error(`HackRF: request ${request} failed (${result.status})`);
    };
    const setGain = async (gain: number) => {
      const index = Math.max(0, Math.min(MAX_TXVGA_DB, Math.round(gain)));
      // This one answers with a single byte, zero meaning the gain was refused.
      const result = await usb.controlTransferIn({ requestType: "vendor", recipient: "device", request: SET_TXVGA_GAIN, value: 0, index }, 1);
      if (result.status !== "ok" || !result.data?.getUint8(0)) throw new Error("HackRF: TX gain was refused");
    };

    return {
      name: usb.productName ?? "HackRF",
      caps: {
        frequency: { min: 1e6, max: 6e9, step: 1 },
        gain: { min: 0, max: MAX_TXVGA_DB, step: 1, label: "TX VGA gain", unit: "dB", initial: 0 },
        format: "s8",
      },
      async startTx({ frequency, gain }) {
        await send(SET_TRANSCEIVER_MODE, MODE_OFF);
        await send(SAMPLE_RATE_SET, 0, 0, words(SAMPLE_RATE, 1)); // rate and divider
        await send(BASEBAND_FILTER_BANDWIDTH_SET, FILTER_BANDWIDTH & 0xffff, FILTER_BANDWIDTH >>> 16);
        await send(SET_FREQ, 0, 0, words(Math.floor(frequency / 1e6), Math.round(frequency % 1e6))); // MHz, then Hz
        await send(AMP_ENABLE, 0);
        await setGain(gain);
        await send(SET_TRANSCEIVER_MODE, MODE_TRANSMIT);
        return { sampleRate: SAMPLE_RATE, chunkSamples: CHUNK_SAMPLES };
      },
      setGain,
      async write(iq) {
        const bytes = new Uint8Array(iq.buffer as ArrayBuffer, iq.byteOffset, iq.byteLength);
        const result = await usb.transferOut(TX_ENDPOINT, bytes);
        if (result.status !== "ok") throw new Error(`HackRF: write failed (${result.status})`);
      },
      stopTx: () => send(SET_TRANSCEIVER_MODE, MODE_OFF),
      close: () => usb.close(),
    };
  },
};
