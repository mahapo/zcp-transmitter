// AD936x transmitter (PlutoSDR, LibreSDR, Pluto+, HamGeek ...) over iiod: tunes
// and streams IQ, then restores every setting it touched.
import type { SdrDevice, SdrDriver, TxSettings, TxStream } from "./device.ts";
import type { IiodClient } from "./iiod/client.ts";
import { openIioUsb } from "./iiod/webusb.ts";

const PHY = "ad9361-phy";
const TX = "cf-ad9361-dds-core-lpc";
const TX_LO = { id: "altvoltage1", output: true };
const TX_CHANNEL = { id: "voltage0", output: true };
const SAMPLE_RATE = 2_500_000; // slow enough to stream in real time
const PULSE_BANDWIDTH = 2_000_000; // wide enough to keep 25 µs pulses square

export const MAX_ATTENUATION_DB = -89.75;

export interface PlutoTxOptions extends TxSettings {
  /** RF bandwidth in Hz. */
  bandwidth?: number;
  /** IQ samples per buffer; a tenth of a second by default. */
  chunkSamples?: number;
}

/**
 * The transmitter of an AD936x board. `control` carries the attributes and
 * `stream` the samples; they may be the same connection.
 */
export class PlutoTx {
  #control: IiodClient;
  #stream: IiodClient;
  #saved: { frequency: string; powerdown: string; gain: number; sampleRate: string; bandwidth: string } | undefined;
  #streaming = false;
  #onAir = false;
  #gain = MAX_ATTENUATION_DB;

  constructor(control: IiodClient, stream = control) {
    this.#control = control;
    this.#stream = stream;
  }

  /** `gain` is the output attenuation in dB, MAX_ATTENUATION_DB..0. */
  async start({ frequency, gain, bandwidth = PULSE_BANDWIDTH, chunkSamples }: PlutoTxOptions): Promise<TxStream> {
    const sdr = this.#control;
    this.#saved = {
      frequency: await sdr.readAttr(PHY, "frequency", TX_LO),
      powerdown: await sdr.readAttr(PHY, "powerdown", TX_LO),
      gain: Number.parseFloat(await sdr.readAttr(PHY, "hardwaregain", TX_CHANNEL)),
      sampleRate: await sdr.readAttr(PHY, "sampling_frequency", TX_CHANNEL),
      bandwidth: await sdr.readAttr(PHY, "rf_bandwidth", TX_CHANNEL),
    };
    this.#gain = gain;
    this.#onAir = false;
    try {
      // Stay at the lowest level until the carrier is on frequency.
      await sdr.writeAttr(PHY, "hardwaregain", MAX_ATTENUATION_DB, TX_CHANNEL);
      await sdr.writeAttr(PHY, "sampling_frequency", SAMPLE_RATE, TX_CHANNEL);
      await sdr.writeAttr(PHY, "rf_bandwidth", bandwidth, TX_CHANNEL);
      await sdr.writeAttr(PHY, "powerdown", 0, TX_LO);
      await sdr.writeAttr(PHY, "frequency", frequency, TX_LO);
      const sampleRate = Number(await sdr.readAttr(PHY, "sampling_frequency", TX_CHANNEL));
      const samples = chunkSamples ?? Math.round(sampleRate / 10);

      // Samples are streamed, not looped from a cyclic buffer: the tezuka
      // firmware powers the TX LO down unless new buffers keep arriving.
      await this.#stream.openBuffer(TX, samples, 0b11);
      this.#streaming = true;
      return { sampleRate, chunkSamples: samples };
    } catch (error) {
      await this.stop().catch(() => {});
      throw error;
    }
  }

  /** Sends one buffer of interleaved 16-bit IQ. The level is raised once the first one is in. */
  async write(iq: ArrayBufferView): Promise<void> {
    await this.#stream.writeBuffer(TX, new Uint8Array(iq.buffer, iq.byteOffset, iq.byteLength));
    if (this.#onAir) return;
    await this.#control.writeAttr(PHY, "hardwaregain", this.#gain, TX_CHANNEL);
    this.#onAir = true;
  }

  async setGain(gain: number): Promise<void> {
    this.#gain = gain;
    if (this.#onAir) await this.#control.writeAttr(PHY, "hardwaregain", gain, TX_CHANNEL);
  }

  /** What the board reports it is doing, e.g. for a status line. */
  async describe(): Promise<string> {
    const frequency = await this.#control.readAttr(PHY, "frequency", TX_LO);
    return `${frequency} Hz at ${await this.#control.readAttr(PHY, "hardwaregain", TX_CHANNEL)}`;
  }

  /** Goes quiet and puts every setting back; the first failure is reported after trying them all. */
  async stop(): Promise<void> {
    const saved = this.#saved;
    if (!saved) return;
    this.#saved = undefined;
    const sdr = this.#control;
    const steps: (() => Promise<void>)[] = [
      () => sdr.writeAttr(PHY, "hardwaregain", MAX_ATTENUATION_DB, TX_CHANNEL),
      () => (this.#streaming ? this.#stream.closeBuffer(TX) : Promise.resolve()),
      () => sdr.writeAttr(PHY, "frequency", saved.frequency, TX_LO),
      () => sdr.writeAttr(PHY, "powerdown", saved.powerdown, TX_LO),
      () => sdr.writeAttr(PHY, "sampling_frequency", saved.sampleRate, TX_CHANNEL),
      () => sdr.writeAttr(PHY, "rf_bandwidth", saved.bandwidth, TX_CHANNEL),
      () => sdr.writeAttr(PHY, "hardwaregain", saved.gain, TX_CHANNEL),
    ];
    let failure: unknown;
    for (const step of steps) await step().catch((error) => (failure ??= error));
    this.#streaming = false;
    this.#onAir = false;
    if (failure) throw failure;
  }
}

/** The WebUSB driver for the app. */
export const pluto: SdrDriver = {
  id: "pluto",
  label: "PlutoSDR / AD936x (HamGeek, LibreSDR, Pluto+)",
  usbFilters: [{ vendorId: 0x0456, productId: 0xb673 }],
  async open(usb): Promise<SdrDevice> {
    const link = await openIioUsb(usb);
    const tx = new PlutoTx(link.control, link.stream);
    return {
      name: usb.productName ?? "PlutoSDR",
      caps: {
        frequency: { min: 70e6, max: 6e9, step: 1 },
        gain: { min: MAX_ATTENUATION_DB, max: 0, step: 0.25, label: "TX attenuation", unit: "dB", initial: MAX_ATTENUATION_DB },
        format: "s16",
      },
      startTx: (settings) => tx.start(settings),
      setGain: (gain) => tx.setGain(gain),
      write: (iq) => tx.write(iq),
      stopTx: () => tx.stop(),
      close: () => link.close(),
    };
  },
};
