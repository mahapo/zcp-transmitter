// The per-sample blocks of the zero-crossing-pulse chain, ported line for line
// from Combination_Catalog/dsp_blocks.py. Like the originals they keep their
// state in double precision and read and write single-precision samples, so the
// output matches the reference. Every block filters its samples in place.

/** One-pole DC blocker: y[n] = x[n] - x[n-1] + r·y[n-1]. */
export class DcBlocker {
  #r: number;
  #x1 = 0;
  #y1 = 0;

  constructor(r = 0.999) {
    this.#r = r;
  }

  process(samples: Float32Array) {
    const r = this.#r;
    let x1 = this.#x1;
    let y1 = this.#y1;
    for (let i = 0; i < samples.length; i++) {
      const x0 = samples[i];
      const y0 = x0 - x1 + r * y1;
      samples[i] = y0;
      x1 = x0;
      y1 = y0;
    }
    this.#x1 = x1;
    this.#y1 = y1;
  }
}

/** Biquad notch (RBJ cookbook) for mains hum. Q = 6 keeps its ringing tail to about 160 ms. */
export class NotchFilter {
  #b0: number;
  #b1: number;
  #a1: number;
  #a2: number;
  #x1 = 0;
  #x2 = 0;
  #y1 = 0;
  #y2 = 0;

  constructor(sampleRate: number, hz = 60, q = 6) {
    const w0 = (2 * Math.PI * hz) / sampleRate;
    const alpha = Math.sin(w0) / (2 * q);
    const a0 = 1 + alpha;
    this.#b0 = 1 / a0;
    this.#b1 = (-2 * Math.cos(w0)) / a0;
    this.#a1 = this.#b1;
    this.#a2 = (1 - alpha) / a0;
  }

  /** Forgets the filter state, as the original does whenever the notch is switched on. */
  reset() {
    this.#x1 = this.#x2 = this.#y1 = this.#y2 = 0;
  }

  process(samples: Float32Array) {
    const b0 = this.#b0;
    const b1 = this.#b1;
    const a1 = this.#a1;
    const a2 = this.#a2;
    let x1 = this.#x1;
    let x2 = this.#x2;
    let y1 = this.#y1;
    let y2 = this.#y2;
    for (let i = 0; i < samples.length; i++) {
      const x0 = samples[i];
      const y0 = b0 * x0 + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
      samples[i] = y0;
      x2 = x1;
      x1 = x0;
      y2 = y1;
      y1 = y0;
    }
    this.#x1 = x1;
    this.#x2 = x2;
    this.#y1 = y1;
    this.#y2 = y2;
  }
}

/**
 * Attenuates fricatives (s, f, sh ...), which have by far the highest
 * zero-crossing rate in speech. The gain ramps from 1 down to `minGain` as a
 * running crossing rate rises from `low` to `high`.
 */
export class FricativeSuppressor {
  #alpha: number;
  #low: number;
  #high: number;
  #minGain: number;
  #rate = 0;
  #previous = 0;

  constructor(sampleRate: number, seconds = 0.01, low = 0.08, high = 0.25, minGain = 0.15) {
    this.#alpha = 1 - Math.exp(-1 / (sampleRate * seconds));
    this.#low = low;
    this.#high = high;
    this.#minGain = minGain;
  }

  process(samples: Float32Array) {
    const alpha = this.#alpha;
    const low = this.#low;
    const high = this.#high;
    const minGain = this.#minGain;
    let rate = this.#rate;
    let previous = this.#previous;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const crossed = s >= 0 !== previous >= 0 ? 1 : 0;
      rate = alpha * crossed + (1 - alpha) * rate;
      previous = s;
      let gain = 1;
      if (rate >= high) gain = minGain;
      else if (rate > low) gain = 1 - ((rate - low) / (high - low)) * (1 - minGain);
      samples[i] = s * gain;
    }
    this.#rate = rate;
    this.#previous = previous;
  }
}

/** Mutes the signal while its short-term power is below a threshold. */
export class NoiseGate {
  #alpha: number;
  #threshold: number;
  #power = 0;

  constructor(thresholdDb = -30, window = 480) {
    this.#alpha = 1 / Math.max(1, window);
    this.#threshold = 10 ** (thresholdDb / 10);
  }

  process(samples: Float32Array) {
    const alpha = this.#alpha;
    const threshold = this.#threshold;
    let power = this.#power;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      power = (1 - alpha) * power + alpha * s * s;
      if (power < threshold) samples[i] = 0;
    }
    this.#power = power;
  }
}

/** Mutes the signal while a 5 ms amplitude envelope is below a threshold. */
export class EnvelopeFollower {
  #alpha: number;
  #threshold: number;
  #envelope = 0;

  constructor(sampleRate: number, seconds = 0.005, threshold = 0.003) {
    this.#alpha = 1 - Math.exp(-1 / (sampleRate * seconds));
    this.#threshold = threshold;
  }

  process(samples: Float32Array) {
    const alpha = this.#alpha;
    const threshold = this.#threshold;
    let envelope = this.#envelope;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      envelope = alpha * Math.abs(s) + (1 - alpha) * envelope;
      if (!(envelope > threshold)) samples[i] = 0;
    }
    this.#envelope = envelope;
  }
}

/**
 * Tracks the noise floor during quiet stretches and applies a Wiener-style
 * gain. The gain has no floor: the pulse generator fires on any crossing, so
 * this stage must be able to reach true silence.
 */
export class SpectralSubtractor {
  #fast: number;
  #slow: number;
  #envelope = 0;
  #noise = 1e-8;

  constructor(sampleRate: number) {
    this.#fast = 1 - Math.exp(-1 / (sampleRate * 0.005));
    this.#slow = 1 - Math.exp(-1 / (sampleRate * 2));
  }

  process(samples: Float32Array) {
    const fast = this.#fast;
    const slow = this.#slow;
    let envelope = this.#envelope;
    let noise = this.#noise;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      envelope = fast * Math.abs(s) + (1 - fast) * envelope;
      if (envelope < noise * 2) noise = slow * envelope + (1 - slow) * noise;
      const snr = envelope / (noise + 1e-10);
      samples[i] = s * (snr / (snr + 1));
    }
    this.#envelope = envelope;
    this.#noise = noise;
  }
}

/** One-pole 4 kHz low-pass, a soft stand-in for decimating 48 kHz to 8 kHz. */
export class Decimator {
  #alpha: number;
  #state = 0;

  constructor(sampleRate: number, cutoffHz = 4000) {
    this.#alpha = 1 - Math.exp((-2 * Math.PI * cutoffHz) / sampleRate);
  }

  process(samples: Float32Array) {
    const alpha = this.#alpha;
    let state = this.#state;
    for (let i = 0; i < samples.length; i++) {
      state = state + alpha * (samples[i] - state);
      samples[i] = state;
    }
    this.#state = state;
  }
}

/**
 * Replaces everything that is not positive with -0.05: far enough below the
 * Schmitt trigger's lower threshold that it trips back between positive lobes.
 */
export function halfWaveRectify(samples: Float32Array) {
  for (let i = 0; i < samples.length; i++) if (!(samples[i] > 0)) samples[i] = -0.05;
}

/** Hysteresis: snaps to +0.5 above `high` and to -0.5 below `low`. */
export class SchmittTrigger {
  #high: number;
  #low: number;
  #state = -0.5;

  constructor(high = 0.01, low = -0.01) {
    this.#high = high;
    this.#low = low;
  }

  process(samples: Float32Array) {
    const high = this.#high;
    const low = this.#low;
    let state = this.#state;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      if (s > high) state = 0.5;
      else if (s < low) state = -0.5;
      samples[i] = state;
    }
    this.#state = state;
  }
}

/** Amplitude envelope minus its slow mean: positive during syllables, negative in pauses. */
export class HilbertEnvelope {
  #fast: number;
  #slow: number;
  #envelope = 0;
  #mean = 0;

  constructor(sampleRate: number, envelopeSeconds = 0.02, meanSeconds = 0.5) {
    this.#fast = 1 - Math.exp(-1 / (sampleRate * envelopeSeconds));
    this.#slow = 1 - Math.exp(-1 / (sampleRate * meanSeconds));
  }

  process(samples: Float32Array) {
    const fast = this.#fast;
    const slow = this.#slow;
    let envelope = this.#envelope;
    let mean = this.#mean;
    for (let i = 0; i < samples.length; i++) {
      envelope = fast * Math.abs(samples[i]) + (1 - fast) * envelope;
      mean = slow * envelope + (1 - slow) * mean;
      samples[i] = envelope - mean;
    }
    this.#envelope = envelope;
    this.#mean = mean;
  }
}

/** Turns every zero crossing into a pulse of ones, `pulseUs` long; a new crossing restarts it. */
export class ZeroCrossPulse {
  #sampleRate: number;
  #length = 1;
  #last = 0;
  #remaining = 0;
  /** Pulses triggered so far. */
  count = 0;

  constructor(sampleRate: number, pulseUs: number) {
    this.#sampleRate = sampleRate;
    this.setPulseUs(pulseUs);
  }

  setPulseUs(pulseUs: number) {
    this.#length = Math.max(1, Math.round(this.#sampleRate * pulseUs * 1e-6));
  }

  process(samples: Float32Array) {
    const length = this.#length;
    let last = this.#last;
    let remaining = this.#remaining;
    for (let i = 0; i < samples.length; i++) {
      const current = samples[i];
      if ((last < 0 && current >= 0) || (last >= 0 && current < 0)) {
        remaining = length;
        this.count++;
      }
      samples[i] = remaining > 0 ? 1 : 0;
      if (remaining > 0) remaining--;
      last = current;
    }
    this.#last = last;
    this.#remaining = remaining;
  }
}
