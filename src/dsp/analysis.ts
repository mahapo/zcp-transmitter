// Measurements on a pulse train (1 during a pulse, else 0).

/** Sample indices at which the pulse train switches on. */
export function onsets(pulses: Float32Array): number[] {
  const found: number[] = [];
  for (let n = 0; n < pulses.length; n++) if (pulses[n] > 0 && !(pulses[n - 1] > 0)) found.push(n);
  return found;
}

/** A radix-2 FFT for one size, with the twiddle factors worked out once. It transforms `re` and `im` in place. */
export function plannedFft(size: number): (re: Float64Array, im: Float64Array) => void {
  const cos = Float64Array.from({ length: size / 2 }, (_, k) => Math.cos((-2 * Math.PI * k) / size));
  const sin = Float64Array.from({ length: size / 2 }, (_, k) => Math.sin((-2 * Math.PI * k) / size));
  const swap = new Uint32Array(size);
  for (let i = 1, j = 0; i < size; i++) {
    let bit = size >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    swap[i] = j;
  }
  return (re, im) => {
    for (let i = 1; i < size; i++) {
      const j = swap[i];
      if (i < j) {
        [re[i], re[j]] = [re[j], re[i]];
        [im[i], im[j]] = [im[j], im[i]];
      }
    }
    for (let span = 2; span <= size; span <<= 1) {
      const stride = size / span;
      for (let base = 0; base < size; base += span) {
        for (let k = 0; k < span / 2; k++) {
          const a = base + k;
          const b = a + span / 2;
          const tre = re[b] * cos[k * stride] - im[b] * sin[k * stride];
          const tim = re[b] * sin[k * stride] + im[b] * cos[k * stride];
          re[b] = re[a] - tre;
          im[b] = im[a] - tim;
          re[a] += tre;
          im[a] += tim;
        }
      }
    }
  };
}

const SPECTRUM_FLOOR_DB = -140;
const plans = new Map<number, ReturnType<typeof plannedFft>>();

/**
 * The averaged spectrum of samples `from`..`to` in dB relative to a full-scale
 * sine: Hann-windowed segments of `size` samples, half overlapping, at most
 * `maxSegments` of them spread over the stretch. Bin k is at k · rate / size.
 */
export function spectrumDb(samples: Float32Array, from = 0, to = samples.length, size = 2048, maxSegments = 64): Float32Array {
  from = Math.max(0, Math.floor(from));
  to = Math.min(samples.length, Math.ceil(to));
  const fft = plans.get(size) ?? plannedFft(size);
  plans.set(size, fft);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const power = new Float64Array(size / 2 + 1);
  // A stretch shorter than one segment is analysed once, padded with silence.
  const room = Math.max(0, to - from - size);
  const segments = Math.max(1, Math.min(maxSegments, Math.floor(room / (size / 2)) + 1));
  let windowSum = 0;
  for (let n = 0; n < size; n++) windowSum += 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / (size - 1));
  for (let segment = 0; segment < segments; segment++) {
    const start = from + (segments > 1 ? Math.round((segment * room) / (segments - 1)) : 0);
    for (let n = 0; n < size; n++) {
      const at = start + n;
      re[n] = at < to ? samples[at] * (0.5 - 0.5 * Math.cos((2 * Math.PI * n) / (size - 1))) : 0;
      im[n] = 0;
    }
    fft(re, im);
    for (let bin = 0; bin < power.length; bin++) power[bin] += re[bin] ** 2 + im[bin] ** 2;
  }
  const scale = 4 / (windowSum * windowSum * segments);
  return Float32Array.from(power, (value) => Math.max(SPECTRUM_FLOOR_DB, 10 * Math.log10(value * scale + 1e-30)));
}
