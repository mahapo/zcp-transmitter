// Finds pulses in received IQ: stretches where the signal stands clear of the noise.

export interface Detection {
  /** Where pulses begin, counted in samples from the start of the stream. */
  onsets: number[];
  /** How long each of them lasts, in samples. A pulse still running at the end of the block is reported with the next one. */
  lengths: number[];
  /** The level of the noise and of the pulses, as magnitudes; `peak` is 0 when there is no pulse. */
  noise: number;
  peak: number;
  /** Root mean square of the whole block. */
  rms: number;
  /** The largest magnitude in the block, for telling when the converter is overdriven. */
  largest: number;
  /** Share of the block that lies inside pulses. */
  duty: number;
  /** The block's magnitude for drawing: the largest value in each of ENVELOPE_POINTS equal stretches. */
  envelope: Float32Array;
}

export const ENVELOPE_POINTS = 600;

const SMOOTH_SAMPLES = 4; // evens out what is left of the carrier offset in the magnitude
const SURVEY_STEP = 16; // every so many samples go into the level estimate
const MIN_RATIO = 4; // pulses must stand 12 dB above the noise to count as pulses
const MIN_PULSE_SECONDS = 10e-6; // shorter than the shortest pulse the app sends (25 µs)
const MERGE_SECONDS = 4e-6; // gaps shorter than this are dips inside one pulse
const HOLD_SECONDS = 0.5; // how long the level of the last pulses is remembered when none are seen

/** Follows a stream of interleaved IQ block by block. */
export class PulseDetector {
  #minPulse: number;
  #merge: number;
  #hold: number;
  #position = 0; // samples seen before the current block
  #start = -1; // where the pulse in progress began, or -1
  #gap = 0; // samples below the threshold since it was last above
  #top = 0; // the level of the pulses last seen
  #topAge = 0; // samples since then

  constructor(sampleRate: number) {
    this.#minPulse = Math.max(2, Math.round(sampleRate * MIN_PULSE_SECONDS));
    this.#merge = Math.max(1, Math.round(sampleRate * MERGE_SECONDS));
    this.#hold = Math.round(sampleRate * HOLD_SECONDS);
  }

  /** Takes the next block of interleaved IQ and reports the pulses that ended within it. */
  push(iq: Int16Array | Float32Array): Detection {
    const count = iq.length >> 1;
    // The receiver's own offset, taken out before the magnitude so that it does not ripple.
    let meanI = 0;
    let meanQ = 0;
    for (let n = 0; n < count; n++) {
      meanI += iq[2 * n];
      meanQ += iq[2 * n + 1];
    }
    meanI /= count || 1;
    meanQ /= count || 1;

    const centred = new Float32Array(count);
    let power = 0;
    let largest = 0;
    for (let n = 0; n < count; n++) {
      largest = Math.max(largest, Math.hypot(iq[2 * n], iq[2 * n + 1]));
      const value = Math.hypot(iq[2 * n] - meanI, iq[2 * n + 1] - meanQ);
      centred[n] = value;
      power += value * value;
    }
    // A running mean over the last few samples.
    const magnitude = new Float32Array(count);
    let sum = 0;
    for (let n = 0; n < count; n++) {
      sum += centred[n];
      if (n >= SMOOTH_SAMPLES) sum -= centred[n - SMOOTH_SAMPLES];
      magnitude[n] = sum / Math.min(n + 1, SMOOTH_SAMPLES);
    }
    return this.#scan(magnitude, Math.sqrt(power / (count || 1)), largest);
  }

  #scan(magnitude: Float32Array, rms: number, largest: number): Detection {
    const count = magnitude.length;
    const survey = Float32Array.from({ length: Math.ceil(count / SURVEY_STEP) }, (_, n) => magnitude[n * SURVEY_STEP]).sort();
    // Pulses fill a small part of the time, so the median is the noise and the top of the range the pulses.
    const noise = survey[survey.length >> 1] ?? 0;
    const seen = survey[Math.min(survey.length - 1, Math.floor(survey.length * 0.999))] ?? 0;
    // A block may hold just the first samples of a pulse, too few to show in its own
    // levels. The level of the pulses seen lately still finds them at the right sample.
    if (seen > noise * MIN_RATIO) {
      this.#top = seen;
      this.#topAge = 0;
    } else if ((this.#topAge += count) > this.#hold) {
      this.#top = 0;
    }
    const top = this.#top;
    const envelope = new Float32Array(ENVELOPE_POINTS);
    for (let n = 0; n < count; n++) {
      const point = Math.floor((n * ENVELOPE_POINTS) / count);
      if (magnitude[n] > envelope[point]) envelope[point] = magnitude[n];
    }
    const found: Detection = { onsets: [], lengths: [], noise, peak: 0, rms, largest, duty: 0, envelope };
    const present = top > noise * MIN_RATIO && top > 0;
    if (present) found.peak = top;
    // Halfway between noise and pulse to switch on, a little lower to stay on.
    const on = noise + 0.5 * (top - noise);
    const off = noise + 0.3 * (top - noise);

    let inside = 0;
    for (let n = 0; n < count; n++) {
      const value = magnitude[n];
      if (this.#start < 0) {
        if (present && value > on) {
          this.#start = this.#position + n;
          this.#gap = 0;
        }
        continue;
      }
      if (present && value > off) {
        this.#gap = 0;
        continue;
      }
      // Below the threshold: the pulse is over once it has stayed there for longer than a dip.
      if (++this.#gap <= this.#merge) continue;
      const length = this.#position + n - this.#gap + 1 - this.#start;
      if (length >= this.#minPulse) {
        found.onsets.push(this.#start);
        found.lengths.push(length);
        inside += length;
      }
      this.#start = -1;
    }
    this.#position += count;
    found.duty = count > 0 ? Math.min(1, inside / count) : 0;
    return found;
  }
}
