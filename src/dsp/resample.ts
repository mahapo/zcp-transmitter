// Turns the 48 kHz pulse train into interleaved IQ at an SDR's sample rate.
// Like the reference's resampler this is a plain sample-and-hold: output n
// takes input floor(n · inRate / outRate). The pulse goes to I, Q stays 0.
import { AMPLITUDE, AUDIO_RATE } from "./config.ts";

/** Interleaved IQ sample formats: 16-bit (AD936x), 8-bit (HackRF) or float (files). */
export type SampleFormat = "s16" | "s8" | "cf32";
export type IqSamples = Int16Array | Int8Array | Float32Array;

function allocate(format: SampleFormat, samples: number): { iq: IqSamples; level: number } {
  if (format === "s16") return { iq: new Int16Array(samples * 2), level: Math.round(AMPLITUDE * 32768) };
  if (format === "s8") return { iq: new Int8Array(samples * 2), level: Math.round(AMPLITUDE * 127) };
  return { iq: new Float32Array(samples * 2), level: AMPLITUDE };
}

/** Streaming sample-and-hold from the pulse rate to `outRate`. */
export class IqHolder {
  readonly outRate: number;
  readonly format: SampleFormat;
  #inRate: number;
  #produced = 0; // output samples so far
  #consumed = 0; // input samples so far
  #held = 0; // the last input sample, which the next outputs may still fall into

  constructor(outRate: number, format: SampleFormat, inRate = AUDIO_RATE) {
    this.outRate = outRate;
    this.format = format;
    this.#inRate = inRate;
  }

  /** The input sample that output sample `n` holds. */
  #source(n: number): number {
    return Math.floor((n * this.#inRate) / this.outRate);
  }

  /** How many new pulse samples the next `count` output samples need. */
  inputNeeded(count: number): number {
    return count > 0 ? this.#source(this.#produced + count - 1) + 1 - this.#consumed : 0;
  }

  /** Renders the next `count` IQ samples from exactly `inputNeeded(count)` pulse samples. */
  render(pulses: Float32Array, count: number): IqSamples {
    const { iq, level } = allocate(this.format, count);
    const first = this.#produced;
    const inRate = this.#inRate;
    const outRate = this.outRate;
    // Fill the run of outputs each active input sample covers; the rest stays zero.
    for (let index = -1; index < pulses.length; index++) {
      if (!((index < 0 ? this.#held : pulses[index]) > 0)) continue;
      const input = this.#consumed + index;
      const from = Math.max(first, Math.ceil((input * outRate) / inRate));
      const to = Math.min(first + count, Math.ceil(((input + 1) * outRate) / inRate));
      for (let n = from; n < to; n++) iq[2 * (n - first)] = level;
    }
    if (pulses.length > 0) this.#held = pulses[pulses.length - 1];
    this.#consumed += pulses.length;
    this.#produced += count;
    // Start counting afresh on whole seconds, so long streams stay exact.
    if (this.#produced % outRate === 0) {
      this.#consumed -= (this.#produced / outRate) * inRate;
      this.#produced = 0;
    }
    return iq;
  }
}

/** Samples at `outRate` that `inputSamples` at `inRate` turn into (the reference resampler's count). */
export function outputLength(inputSamples: number, outRate: number, inRate = AUDIO_RATE): number {
  return Math.ceil((inputSamples * outRate) / inRate);
}

/** Converts a whole pulse train in one go. */
export function toIq(pulses: Float32Array, outRate: number, format: SampleFormat): IqSamples {
  return new IqHolder(outRate, format).render(pulses, outputLength(pulses.length, outRate));
}

/** Pulse samples waiting to be transmitted. */
export class PulseQueue {
  #parts: Float32Array[] = [];
  #length = 0;

  get length(): number {
    return this.#length;
  }

  push(pulses: Float32Array) {
    if (pulses.length === 0) return;
    this.#parts.push(pulses);
    this.#length += pulses.length;
  }

  /** Takes the next `count` samples, padded with silence when fewer are waiting. */
  pull(count: number): Float32Array {
    const out = new Float32Array(count);
    let filled = 0;
    while (filled < count && this.#parts.length > 0) {
      const part = this.#parts[0];
      const take = Math.min(part.length, count - filled);
      out.set(part.subarray(0, take), filled);
      filled += take;
      if (take === part.length) this.#parts.shift();
      else this.#parts[0] = part.subarray(take);
    }
    this.#length -= filled;
    return out;
  }

  clear() {
    this.#parts = [];
    this.#length = 0;
  }
}
