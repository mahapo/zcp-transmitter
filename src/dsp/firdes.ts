// Windowed-sinc FIR design and filtering, matching GNU Radio's firdes (Hamming
// window) and fir_filter_fff so the chain reproduces the reference catalog.

const HAMMING_ATTENUATION_DB = 53;

/** GNU Radio's tap count for a transition width: always odd. */
function tapCount(sampleRate: number, transitionHz: number): number {
  return Math.trunc((HAMMING_ATTENUATION_DB * sampleRate) / (22 * transitionHz)) | 1;
}

/**
 * Builds taps from an ideal impulse response `ideal(n)` for n = -M..M, windows
 * them and scales them to unity gain at the frequency `normaliseAt` (radians per sample).
 */
function design(sampleRate: number, transitionHz: number, ideal: (n: number) => number, normaliseAt: number): Float32Array {
  const count = tapCount(sampleRate, transitionHz);
  const half = (count - 1) / 2;
  const taps = new Float32Array(count);
  for (let n = -half; n <= half; n++) {
    const window = Math.fround(0.54 - 0.46 * Math.cos((2 * Math.PI * (n + half)) / (count - 1)));
    taps[n + half] = ideal(n) * window;
  }
  let response = taps[half];
  for (let n = 1; n <= half; n++) response += 2 * taps[n + half] * Math.cos(n * normaliseAt);
  const gain = 1 / response;
  for (let n = 0; n < count; n++) taps[n] *= gain;
  return taps;
}

export function lowPass(sampleRate: number, cutoffHz: number, transitionHz: number): Float32Array {
  const w = (2 * Math.PI * cutoffHz) / sampleRate;
  return design(sampleRate, transitionHz, (n) => (n === 0 ? w / Math.PI : Math.sin(n * w) / (n * Math.PI)), 0);
}

export function highPass(sampleRate: number, cutoffHz: number, transitionHz: number): Float32Array {
  const w = (2 * Math.PI * cutoffHz) / sampleRate;
  return design(sampleRate, transitionHz, (n) => (n === 0 ? 1 - w / Math.PI : -Math.sin(n * w) / (n * Math.PI)), Math.PI);
}

export function bandPass(sampleRate: number, lowHz: number, highHz: number, transitionHz: number): Float32Array {
  const low = (2 * Math.PI * lowHz) / sampleRate;
  const high = (2 * Math.PI * highHz) / sampleRate;
  return design(
    sampleRate,
    transitionHz,
    (n) => (n === 0 ? (high - low) / Math.PI : (Math.sin(n * high) - Math.sin(n * low)) / (n * Math.PI)),
    (low + high) / 2,
  );
}

/** A streaming FIR filter: y[n] = Σ taps[k]·x[n-k], starting from silence. */
export class Fir {
  #reversed: Float32Array;
  #work = new Float32Array(0); // the previous taps-1 inputs followed by the current block

  constructor(taps: Float32Array) {
    this.#reversed = taps.slice().reverse();
  }

  /** Replaces the taps, keeping the input history when the length is unchanged. */
  setTaps(taps: Float32Array) {
    if (taps.length !== this.#reversed.length) this.#work = new Float32Array(0);
    this.#reversed = taps.slice().reverse();
  }

  /** Filters `samples` in place. With `bypass` the samples pass unchanged but still enter the history. */
  process(samples: Float32Array, bypass = false) {
    const taps = this.#reversed;
    const history = taps.length - 1;
    const count = samples.length;
    if (this.#work.length < history + count) {
      const grown = new Float32Array(history + count);
      grown.set(this.#work.subarray(0, Math.min(history, this.#work.length)));
      this.#work = grown;
    }
    const work = this.#work;
    work.set(samples, history);
    if (!bypass) {
      const last = taps.length - (taps.length % 4);
      for (let i = 0; i < count; i++) {
        let a = 0;
        let b = 0;
        let c = 0;
        let d = 0;
        for (let k = 0; k < last; k += 4) {
          a += taps[k] * work[i + k];
          b += taps[k + 1] * work[i + k + 1];
          c += taps[k + 2] * work[i + k + 2];
          d += taps[k + 3] * work[i + k + 3];
        }
        for (let k = last; k < taps.length; k++) a += taps[k] * work[i + k];
        samples[i] = a + b + c + d;
      }
    }
    work.copyWithin(0, count, count + history);
  }
}
