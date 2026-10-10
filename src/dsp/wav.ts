// WAV decoding and the preparation the reference applies to an utterance.
import { AUDIO_RATE, SILENCE_SECONDS } from "./config.ts";

/** Mono audio, samples in -1..1. */
export interface Audio {
  sampleRate: number;
  samples: Float32Array;
}

/** Decodes a 16-bit PCM WAV file and mixes it down to mono. */
export function decodeWav(file: Uint8Array): Audio {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const tag = (offset: number) => String.fromCharCode(...file.subarray(offset, offset + 4));
  if (file.length < 12 || tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("not a WAV file");
  let format: { channels: number; sampleRate: number } | undefined;
  for (let offset = 12; offset + 8 <= file.length; ) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt ") {
      if (view.getUint16(body, true) !== 1 || view.getUint16(body + 14, true) !== 16) {
        throw new Error("only 16-bit PCM WAV files are supported");
      }
      format = { channels: view.getUint16(body + 2, true), sampleRate: view.getUint32(body + 4, true) };
    } else if (id === "data" && format) {
      const { channels, sampleRate } = format;
      const frames = Math.floor(Math.min(size, file.length - body) / (2 * channels));
      const samples = new Float32Array(frames);
      for (let n = 0; n < frames; n++) {
        let sum = 0;
        for (let c = 0; c < channels; c++) sum += view.getInt16(body + 2 * (n * channels + c), true);
        samples[n] = sum / channels / 32768;
      }
      return { sampleRate, samples };
    }
    offset = body + size + (size & 1);
  }
  throw new Error("the WAV file has no audio data");
}

/** Linear-interpolation resampling, endpoints kept. */
export function resample({ sampleRate, samples }: Audio, toRate: number): Audio {
  if (sampleRate === toRate || samples.length < 2) return { sampleRate: toRate, samples };
  const length = Math.round((samples.length * toRate) / sampleRate);
  const out = new Float32Array(length);
  const step = (samples.length - 1) / (length - 1);
  for (let n = 0; n < length; n++) {
    const position = n === length - 1 ? samples.length - 1 : n * step;
    const index = Math.min(Math.floor(position), samples.length - 2);
    out[n] = samples[index] + (samples[index + 1] - samples[index]) * (position - index);
  }
  return { sampleRate: toRate, samples: out };
}

/**
 * Prepares an utterance the way the reference does before the chain: 48 kHz,
 * silence on both ends, and rounded to 16 bits (it passes through a WAV file there).
 */
export function prepareUtterance(audio: Audio): Float32Array {
  const { samples } = resample(audio, AUDIO_RATE);
  const pad = Math.trunc(AUDIO_RATE * SILENCE_SECONDS);
  const out = new Float32Array(samples.length + 2 * pad);
  for (let n = 0; n < samples.length; n++) {
    // Truncated in single precision, as numpy does it there.
    out[pad + n] = (Math.fround(Math.max(-1, Math.min(1, samples[n])) * 32767) | 0) / 32768;
  }
  return out;
}
