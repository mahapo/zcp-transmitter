// Pulse-waterfall spectrogram of a pulse train, with the maths of
// generate_waterfall() in the Python reference's generate_combinations.py.
import { AMPLITUDE, AUDIO_RATE, CATALOG_RATE } from "./config.ts";

export const FFT_SIZE = 64;
/** IQ samples between frames. */
export const HOP = 32;
const MAX_SECONDS = 3;
const MARGIN_SECONDS = 0.001; // kept around the active stretch
const POWER_FLOOR = 1e-10;
/** What a frame without any pulse shows. */
export const SILENCE_DB = 10 * Math.log10(POWER_FLOOR);

/** The part of a spectrogram that can cross to another thread. */
export interface SpectrogramData {
  /** Sample rate of the analysed IQ signal. */
  sampleRate: number;
  /** First analysed IQ sample and how many follow. */
  start: number;
  length: number;
  frames: number;
  /** IQ samples between frames. */
  hop: number;
  /** Power in dB, `frames` rows of FFT_SIZE bins running from -sampleRate/2 up. */
  db: Float32Array;
  minDb: number;
  maxDb: number;
}

export interface Spectrogram extends SpectrogramData {
  /** |IQ| of sample `start + n`. */
  envelope(n: number): number;
}

/** In-place radix-2 FFT. */
export function fft(re: Float64Array, im: Float64Array) {
  const size = re.length;
  for (let i = 1, j = 0; i < size; i++) {
    let bit = size >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let span = 2; span <= size; span <<= 1) {
    const angle = (-2 * Math.PI) / span;
    for (let base = 0; base < size; base += span) {
      for (let k = 0; k < span / 2; k++) {
        const cos = Math.cos(angle * k);
        const sin = Math.sin(angle * k);
        const a = base + k;
        const b = a + span / 2;
        const tre = re[b] * cos - im[b] * sin;
        const tim = re[b] * sin + im[b] * cos;
        re[b] = re[a] - tre;
        im[b] = im[a] - tim;
        re[a] += tre;
        im[a] += tim;
      }
    }
  }
}

/** numpy.hanning(FFT_SIZE). */
export const HANN = Float64Array.from({ length: FFT_SIZE }, (_, n) => 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / (FFT_SIZE - 1)));

/** |IQ| of IQ sample `n` of a pulse train that is transmitted at `sampleRate`. */
export function envelopeAt(pulses: Float32Array, n: number, sampleRate = CATALOG_RATE, pulseRate = AUDIO_RATE): number {
  return pulses[Math.floor((n * pulseRate) / sampleRate)] > 0 ? AMPLITUDE : 0;
}

const re = new Float64Array(FFT_SIZE);
const im = new Float64Array(FFT_SIZE);

/**
 * The power spectrum in dB of the frame of FFT_SIZE samples that starts at
 * `envelope(first)`. Writes its bins, negative frequencies first, to `db` from
 * `offset` on and returns the largest. A frame without a pulse leaves `db`
 * alone and returns undefined.
 */
export function frameDb(envelope: (n: number) => number, first: number, db: Float32Array, offset: number): number | undefined {
  let active = false;
  for (let n = 0; n < FFT_SIZE; n++) {
    const value = envelope(first + n);
    active ||= value > 0;
    re[n] = value * HANN[n];
    im[n] = 0;
  }
  if (!active) return undefined;
  fft(re, im);
  let max = -Infinity;
  for (let bin = 0; bin < FFT_SIZE; bin++) {
    const from = (bin + FFT_SIZE / 2) % FFT_SIZE; // fftshift: negative frequencies first
    const value = 10 * Math.log10(re[from] ** 2 + im[from] ** 2 + POWER_FLOOR);
    db[offset + bin] = value;
    if (value > max) max = value;
  }
  return max;
}

/** `spectrogram` without the envelope, which `withEnvelope` adds again on the thread that draws. */
export function analyse(pulses: Float32Array, sampleRate = CATALOG_RATE, pulseRate = AUDIO_RATE): SpectrogramData | undefined {
  const firstPulse = pulses.findIndex((value) => value > 0);
  if (firstPulse < 0) return undefined;
  const lastPulse = pulses.findLastIndex((value) => value > 0);
  const total = Math.ceil((pulses.length * sampleRate) / pulseRate);
  const margin = Math.trunc(sampleRate * MARGIN_SECONDS);
  const start = Math.max(0, Math.ceil((firstPulse * sampleRate) / pulseRate) - margin);
  const end = Math.min(total, Math.ceil(((lastPulse + 1) * sampleRate) / pulseRate) - 1 + margin);
  const length = Math.min(end - start, Math.trunc(sampleRate * MAX_SECONDS));
  const frames = Math.floor((length - FFT_SIZE) / HOP);
  if (frames < 1) return undefined;

  const envelope = (n: number) => envelopeAt(pulses, start + n, sampleRate, pulseRate);
  const db = new Float32Array(frames * FFT_SIZE).fill(SILENCE_DB);
  let maxDb = SILENCE_DB;
  for (let frame = 0; frame < frames; frame++) {
    const max = frameDb(envelope, frame * HOP, db, frame * FFT_SIZE);
    if (max !== undefined && max > maxDb) maxDb = max;
  }
  return { sampleRate, start, length, frames, hop: HOP, db, minDb: SILENCE_DB, maxDb };
}

export function withEnvelope(data: SpectrogramData, pulses: Float32Array, pulseRate = AUDIO_RATE): Spectrogram {
  return { ...data, envelope: (n) => envelopeAt(pulses, data.start + n, data.sampleRate, pulseRate) };
}

/**
 * The spectrogram of `pulses` as transmitted at `sampleRate`, trimmed to the
 * stretch that contains pulses and capped at three seconds. Undefined when
 * there is no pulse at all.
 */
export function spectrogram(pulses: Float32Array, sampleRate = CATALOG_RATE, pulseRate = AUDIO_RATE): Spectrogram | undefined {
  const data = analyse(pulses, sampleRate, pulseRate);
  return data && withEnvelope(data, pulses, pulseRate);
}

// matplotlib's inferno, sampled at nine points.
const INFERNO_STOPS = [0x000004, 0x1f0c48, 0x550f6d, 0x88226a, 0xba3655, 0xe35933, 0xf98c0a, 0xf9c932, 0xfcffa4];

/** Inferno as 256 RGB triples. */
export const INFERNO = (() => {
  const table = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const position = (i / 255) * (INFERNO_STOPS.length - 1);
    const below = Math.min(Math.floor(position), INFERNO_STOPS.length - 2);
    const mix = position - below;
    for (let channel = 0; channel < 3; channel++) {
      const shift = 16 - 8 * channel;
      const a = (INFERNO_STOPS[below] >> shift) & 0xff;
      const b = (INFERNO_STOPS[below + 1] >> shift) & 0xff;
      table[3 * i + channel] = a + (b - a) * mix;
    }
  }
  return table;
})();
