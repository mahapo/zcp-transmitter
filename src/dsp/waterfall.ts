// The pulse waterfall of a stream that never ends: the same frames as
// spectrogram.ts, on a continuous time base, pooled into display columns.
import { AMPLITUDE, AUDIO_RATE, CATALOG_RATE } from "./config.ts";
import { FFT_SIZE, HANN, HOP, SILENCE_DB, frameDb } from "./spectrogram.ts";

/** Frames per column of the waterfall the app rolls: 250 frames of 16 µs are 4 ms. */
export const ROLLING_FRAMES_PER_COLUMN = 250;
export const ROLLING_COLUMN_SECONDS = (ROLLING_FRAMES_PER_COLUMN * HOP) / CATALOG_RATE;

/** The level of a frame that lies wholly inside a pulse, which is as strong as a frame gets. */
export const FULL_PULSE_DB = 20 * Math.log10(AMPLITUDE * HANN.reduce((sum, value) => sum + value, 0));

export class RollingWaterfall {
  #framesPerColumn: number;
  #onColumn: (db: Float32Array) => void;
  #sampleRate: number;
  #pending = new Float32Array(0); // pulse samples the next frame still needs
  #pendingStart = 0; // index of #pending[0] in the stream of pulses
  #frame = 0; // the next frame, counted from the start of the stream
  #column: Float32Array;
  #inColumn = 0;

  /**
   * `onColumn` receives one column for every `framesPerColumn` frames: per bin
   * the strongest of them in dB, negative frequencies first. The array is
   * reused, so copy what is to be kept.
   */
  constructor(framesPerColumn: number, onColumn: (db: Float32Array) => void, sampleRate = CATALOG_RATE) {
    this.#framesPerColumn = framesPerColumn;
    this.#onColumn = onColumn;
    this.#sampleRate = sampleRate;
    this.#column = new Float32Array(FFT_SIZE).fill(SILENCE_DB);
  }

  /** Seconds of signal one column covers. */
  get columnSeconds(): number {
    return (this.#framesPerColumn * HOP) / this.#sampleRate;
  }

  /** Takes the next pulses of the stream (1 during a pulse, else 0, at 48 kHz). */
  push(pulses: Float32Array) {
    const joined = new Float32Array(this.#pending.length + pulses.length);
    joined.set(this.#pending);
    joined.set(pulses, this.#pending.length);
    const start = this.#pendingStart;
    const available = Math.ceil(((start + joined.length) * this.#sampleRate) / AUDIO_RATE); // IQ samples that exist so far
    const envelope = (n: number) => (joined[Math.floor((n * AUDIO_RATE) / this.#sampleRate) - start] > 0 ? AMPLITUDE : 0);
    const frame = new Float32Array(FFT_SIZE);

    for (; this.#frame * HOP + FFT_SIZE <= available; this.#frame++) {
      const first = this.#frame * HOP;
      // Most frames hold no pulse; telling so from the few pulse samples under them is far cheaper than the frame.
      const from = Math.floor((first * AUDIO_RATE) / this.#sampleRate) - start;
      const to = Math.floor(((first + FFT_SIZE - 1) * AUDIO_RATE) / this.#sampleRate) - start;
      let active = false;
      for (let n = from; n <= to && !active; n++) active = joined[n] > 0;
      if (active && frameDb(envelope, first, frame, 0) !== undefined) {
        for (let bin = 0; bin < FFT_SIZE; bin++) if (frame[bin] > this.#column[bin]) this.#column[bin] = frame[bin];
      }
      if (++this.#inColumn === this.#framesPerColumn) {
        this.#onColumn(this.#column);
        this.#column.fill(SILENCE_DB);
        this.#inColumn = 0;
      }
    }

    // Keep the pulse samples from the next frame's first one on.
    const keepFrom = Math.max(0, Math.min(joined.length, Math.floor((this.#frame * HOP * AUDIO_RATE) / this.#sampleRate) - start));
    this.#pending = joined.slice(keepFrom);
    this.#pendingStart = start + keepFrom;
  }
}

/** A level as one byte on the fixed scale from silence to a full pulse, for indexing a colour table. */
export function levelByte(db: number): number {
  return Math.max(0, Math.min(255, Math.round(((db - SILENCE_DB) / (FULL_PULSE_DB - SILENCE_DB)) * 255)));
}
