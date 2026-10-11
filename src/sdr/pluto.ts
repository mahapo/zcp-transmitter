// AD936x transmitter and receiver (PlutoSDR, LibreSDR, Pluto+, HamGeek ...) over
// iiod: each tunes and streams IQ, then restores every setting it touched.
import type { RxSettings, RxStream, SdrDevice, SdrDriver, TxSettings, TxStream } from "./device.ts";
import { type IiodClient, toInt16 } from "./iiod/client.ts";
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

const RX = "cf-ad9361-lpc";
const RX_LO = { id: "altvoltage0", output: true };
const RX_CHANNEL = { id: "voltage0", output: false };
const RX_BLOCK_SECONDS = 0.05;
const RX_FULL_SCALE = 2048; // 12-bit converter
const RX_BYTES_PER_SAMPLE = 4; // 16-bit I + 16-bit Q
/**
 * The receiver tunes this far below the frequency it is to watch. An
 * unmodulated pulse would otherwise sit exactly where the receiver removes its
 * own DC offset and where its oscillator leaks.
 */
export const RX_OFFSET_HZ = 500_000;
export const MAX_RX_GAIN_DB = 71;

/**
 * The receiver of an AD936x board. `control` carries the attributes and
 * `stream` the samples; `stream` must not be the session that transmits.
 */
export class PlutoRx {
  #control: IiodClient;
  #stream: IiodClient;
  #saved: { frequency: string; gainMode: string; gain: number; bandwidth: string; sampleRate?: string } | undefined;
  #streaming = false;
  #blockSamples = 0;

  constructor(control: IiodClient, stream: IiodClient) {
    this.#control = control;
    this.#stream = stream;
  }

  /** `gain` is the receiver's gain in dB, 0..MAX_RX_GAIN_DB, set by hand so that it does not pump on the pulses. */
  async start({ frequency, gain, ownsRate }: RxSettings): Promise<RxStream> {
    const sdr = this.#control;
    this.#saved = {
      frequency: await sdr.readAttr(PHY, "frequency", RX_LO),
      gainMode: await sdr.readAttr(PHY, "gain_control_mode", RX_CHANNEL),
      gain: Number.parseFloat(await sdr.readAttr(PHY, "hardwaregain", RX_CHANNEL)),
      bandwidth: await sdr.readAttr(PHY, "rf_bandwidth", RX_CHANNEL),
      // Both directions share one rate; while the transmitter runs it is the transmitter's to set.
      sampleRate: ownsRate ? await sdr.readAttr(PHY, "sampling_frequency", RX_CHANNEL) : undefined,
    };
    try {
      if (ownsRate) await sdr.writeAttr(PHY, "sampling_frequency", SAMPLE_RATE, RX_CHANNEL);
      await sdr.writeAttr(PHY, "rf_bandwidth", PULSE_BANDWIDTH, RX_CHANNEL);
      await sdr.writeAttr(PHY, "gain_control_mode", "manual", RX_CHANNEL);
      await sdr.writeAttr(PHY, "hardwaregain", gain, RX_CHANNEL);
      await sdr.writeAttr(PHY, "frequency", Math.round(frequency - RX_OFFSET_HZ), RX_LO);
      const sampleRate = Number(await sdr.readAttr(PHY, "sampling_frequency", RX_CHANNEL));
      this.#blockSamples = Math.round(sampleRate * RX_BLOCK_SECONDS);
      await this.#stream.openBuffer(RX, this.#blockSamples, 0b11);
      this.#streaming = true;
      return { sampleRate, blockSamples: this.#blockSamples, fullScale: RX_FULL_SCALE };
    } catch (error) {
      await this.stop().catch(() => {});
      throw error;
    }
  }

  /** The next block of interleaved 16-bit IQ. */
  async read(): Promise<Int16Array> {
    return toInt16(await this.#stream.readBuffer(RX, this.#blockSamples * RX_BYTES_PER_SAMPLE));
  }

  async setGain(gain: number): Promise<void> {
    if (this.#streaming) await this.#control.writeAttr(PHY, "hardwaregain", gain, RX_CHANNEL);
  }

  /** Stops streaming and puts every setting back; the first failure is reported after trying them all. */
  async stop(): Promise<void> {
    const saved = this.#saved;
    if (!saved) return;
    this.#saved = undefined;
    const sdr = this.#control;
    const steps: (() => Promise<void>)[] = [
      () => (this.#streaming ? this.#stream.closeBuffer(RX) : Promise.resolve()),
      () => sdr.writeAttr(PHY, "frequency", saved.frequency, RX_LO),
      () => sdr.writeAttr(PHY, "rf_bandwidth", saved.bandwidth, RX_CHANNEL),
      // The gain can only be written while it is still set by hand.
      () => sdr.writeAttr(PHY, "hardwaregain", saved.gain, RX_CHANNEL),
      () => sdr.writeAttr(PHY, "gain_control_mode", saved.gainMode, RX_CHANNEL),
      () => (saved.sampleRate === undefined ? Promise.resolve() : sdr.writeAttr(PHY, "sampling_frequency", saved.sampleRate, RX_CHANNEL)),
    ];
    let failure: unknown;
    for (const step of steps) await step().catch((error) => (failure ??= error));
    this.#streaming = false;
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
    // The receiver gets its USB pipe when it is first started.
    let rx: PlutoRx | undefined;
    return {
      name: usb.productName ?? "PlutoSDR",
      caps: {
        frequency: { min: 70e6, max: 6e9, step: 1 },
        gain: { min: MAX_ATTENUATION_DB, max: 0, step: 0.25, label: "TX attenuation", unit: "dB", initial: MAX_ATTENUATION_DB },
        format: "s16",
        rxGain: { min: 0, max: MAX_RX_GAIN_DB, step: 1, unit: "dB", initial: 20 },
      },
      startTx: (settings) => tx.start(settings),
      setGain: (gain) => tx.setGain(gain),
      write: (iq) => tx.write(iq),
      stopTx: () => tx.stop(),
      rx: {
        async start(settings) {
          rx ??= new PlutoRx(link.control, await link.receive());
          return rx.start(settings);
        },
        read: () => rx!.read(),
        setGain: async (gain) => rx?.setGain(gain),
        stop: async () => rx?.stop(),
      },
      close: () => link.close(),
    };
  },
};
