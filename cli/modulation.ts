// FM / AM modulation.
import type { Audio } from "../src/dsp/wav.ts";

export type Modulation = "fm" | "am";

export function isModulation(value: string): value is Modulation {
  return value === "fm" || value === "am";
}

export const BANDWIDTH = 200_000; // RF bandwidth for a narrowband voice channel
export const CHUNK_SAMPLES = 1 << 18; // IQ samples per buffer

const AMPLITUDE = 2 ** 14; // carrier level, half of full scale
const FM_DEVIATION_HZ = 2500;
const AM_DEPTH = 0.8;
const AUDIO_CUTOFF_HZ = 3000;
const PRE_EMPHASIS_HZ = 300;
const LEAD_IN_SECONDS = 0.3; // plain carrier so the receiver's squelch is open before the audio
const TAIL_SECONDS = 0.5; // plain carrier while the board plays out what is still queued

/** A full-scale sine tone. */
export function tone(hz: number, seconds: number, sampleRate = 48000): Audio {
  const samples = Float32Array.from({ length: Math.round(seconds * sampleRate) }, (_, n) =>
    Math.sin((2 * Math.PI * hz * n) / sampleRate),
  );
  return { sampleRate, samples };
}

/** Sixth-order Butterworth low-pass, in place. */
function lowPass(samples: Float32Array, sampleRate: number, cutoffHz: number) {
  const w0 = (2 * Math.PI * cutoffHz) / sampleRate;
  for (const q of [0.5176, 0.7071, 1.9319]) {
    const alpha = Math.sin(w0) / (2 * q);
    const a0 = 1 + alpha;
    const b1 = (1 - Math.cos(w0)) / a0;
    const b0 = b1 / 2;
    const a1 = (-2 * Math.cos(w0)) / a0;
    const a2 = (1 - alpha) / a0;
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    for (let n = 0; n < samples.length; n++) {
      const x = samples[n];
      const y = b0 * x + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
      x2 = x1;
      x1 = x;
      y2 = y1;
      y1 = y;
      samples[n] = y;
    }
  }
}

function scaleTo(samples: Float32Array, level: number) {
  if (level > 0) for (let n = 0; n < samples.length; n++) samples[n] /= level;
}

/**
 * Prepares audio for a two-way radio's voice channel: limiter and 3 kHz
 * low-pass, plus pre-emphasis for FM so it sounds right after the receiver's
 * de-emphasis. The result peaks at 1.
 */
export function shapeAudio({ sampleRate, samples }: Audio, mode: Modulation): Audio {
  const out = new Float32Array(samples.length);
  const a = mode === "fm" ? Math.exp((-2 * Math.PI * PRE_EMPHASIS_HZ) / sampleRate) : 0;
  for (let n = 0; n < samples.length; n++) out[n] = samples[n] - a * (samples[n - 1] ?? 0);

  // Limit to the level only 0.5 % of samples exceed, as peaks alone would leave the average quiet.
  const sorted = out.map(Math.abs).sort();
  scaleTo(out, sorted[Math.floor(sorted.length * 0.995)]);
  for (let n = 0; n < out.length; n++) out[n] = Math.max(-1, Math.min(1, out[n]));

  lowPass(out, sampleRate, AUDIO_CUTOFF_HZ);
  scaleTo(out, out.reduce((peak, value) => Math.max(peak, Math.abs(value)), 0));
  return { sampleRate, samples: out };
}

/**
 * Modulates `audio` (peaking at 1) onto a carrier and yields it as buffers of
 * `chunkSamples` interleaved 16-bit IQ samples at `rfRate` samples per second.
 */
export function* modulate(audio: Audio, mode: Modulation, rfRate: number, chunkSamples: number): Generator<Buffer> {
  const { samples, sampleRate } = audio;
  const step = sampleRate / rfRate;
  const lead = LEAD_IN_SECONDS * sampleRate;
  const total = Math.ceil((samples.length / sampleRate + LEAD_IN_SECONDS + TAIL_SECONDS) * rfRate);
  const radiansPerUnit = (2 * Math.PI * FM_DEVIATION_HZ) / rfRate;
  let phase = 0;
  for (let start = 0; start < total; start += chunkSamples) {
    const iq = new Int16Array(chunkSamples * 2);
    for (let n = 0; n < chunkSamples; n++) {
      const position = (start + n) * step - lead;
      const index = Math.floor(position);
      const before = samples[index] ?? 0;
      const after = samples[index + 1] ?? 0;
      const value = before + (after - before) * (position - index);
      if (mode === "am") {
        iq[2 * n] = Math.round(AMPLITUDE * (1 + AM_DEPTH * value));
        continue;
      }
      phase += radiansPerUnit * value;
      if (phase > Math.PI) phase -= 2 * Math.PI;
      else if (phase < -Math.PI) phase += 2 * Math.PI;
      iq[2 * n] = Math.round(AMPLITUDE * Math.cos(phase));
      iq[2 * n + 1] = Math.round(AMPLITUDE * Math.sin(phase));
    }
    yield Buffer.from(iq.buffer);
  }
}
