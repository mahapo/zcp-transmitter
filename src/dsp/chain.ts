// The zero-crossing-pulse chain: speech in, one pulse per zero crossing out.
// Block order and parameters follow CatalogRun in
// Combination_Catalog/generate_combinations.py.
import {
  DcBlocker,
  Decimator,
  EnvelopeFollower,
  FricativeSuppressor,
  HilbertEnvelope,
  NoiseGate,
  NotchFilter,
  SchmittTrigger,
  SpectralSubtractor,
  ZeroCrossPulse,
  halfWaveRectify,
} from "./blocks.ts";
import { AUDIO_RATE, type ChainConfig, type Filters, noFilters } from "./config.ts";
import { Fir, bandPass, highPass, lowPass } from "./firdes.ts";

const HPF_TRANSITION_HZ = 50;
const LPF_TRANSITION_HZ = 200;
const F1_BAND_HZ = [300, 900];
const F1_TRANSITION_HZ = 100;

const AGC_RATE = Math.fround(1e-4);
const AGC_REFERENCE = 0.5;
const AGC_MAX_GAIN = 65536;

const { fround } = Math;

export class ZcpChain {
  #config: ChainConfig;
  #dcBlocker = new DcBlocker();
  #notch: NotchFilter;
  #hpf: Fir;
  #lpf: Fir;
  #f1: Fir;
  #f1Taps: number;
  #fricative: FricativeSuppressor;
  #preEmphasisLast = 0;
  #agcGain = 1;
  #noiseGate = new NoiseGate();
  #envelopeFollower: EnvelopeFollower;
  #spectralSub: SpectralSubtractor;
  #decimator: Decimator;
  #schmitt = new SchmittTrigger();
  #hilbert: HilbertEnvelope;
  #pulse: ZeroCrossPulse;
  #sampleRate: number;
  // Outputs still to drop after switching the F1 band-pass or pre-emphasis on, see #skip.
  #f1Skip = 0;
  #preEmphasisSkip = 0;

  constructor(config: ChainConfig, sampleRate = AUDIO_RATE) {
    this.#config = config;
    this.#sampleRate = sampleRate;
    this.#notch = new NotchFilter(sampleRate);
    this.#hpf = new Fir(highPass(sampleRate, config.hpfHz, HPF_TRANSITION_HZ));
    this.#lpf = new Fir(lowPass(sampleRate, config.lpfHz, LPF_TRANSITION_HZ));
    const f1 = bandPass(sampleRate, F1_BAND_HZ[0], F1_BAND_HZ[1], F1_TRANSITION_HZ);
    this.#f1 = new Fir(f1);
    this.#f1Taps = f1.length;
    this.#fricative = new FricativeSuppressor(sampleRate);
    this.#envelopeFollower = new EnvelopeFollower(sampleRate);
    this.#spectralSub = new SpectralSubtractor(sampleRate);
    this.#decimator = new Decimator(sampleRate);
    this.#hilbert = new HilbertEnvelope(sampleRate);
    this.#pulse = new ZeroCrossPulse(sampleRate, config.pulseUs);
    this.#armSkips(noFilters(), config.filters);
  }

  /** Pulses triggered since the chain was created. */
  get pulseCount(): number {
    return this.#pulse.count;
  }

  /** Changes the settings of a running chain. */
  setConfig(config: ChainConfig) {
    const previous = this.#config;
    this.#config = config;
    if (config.hpfHz !== previous.hpfHz) this.#hpf.setTaps(highPass(this.#sampleRate, config.hpfHz, HPF_TRANSITION_HZ));
    if (config.lpfHz !== previous.lpfHz) this.#lpf.setTaps(lowPass(this.#sampleRate, config.lpfHz, LPF_TRANSITION_HZ));
    if (config.pulseUs !== previous.pulseUs) this.#pulse.setPulseUs(config.pulseUs);
    if (config.filters.notch && !previous.filters.notch) this.#notch.reset();
    this.#armSkips(previous.filters, config.filters);
  }

  /**
   * The reference switches these two filters on by giving a running one-tap
   * filter longer taps. GNU Radio then starts the new filter on samples still
   * to come, which drops its first taps-1 outputs. Dropping them here as well
   * keeps everything downstream sample-identical to the reference.
   */
  #armSkips(before: Filters, after: Filters) {
    if (after.f1Bandpass && !before.f1Bandpass) this.#f1Skip = this.#f1Taps - 1;
    if (after.preEmphasis && !before.preEmphasis) this.#preEmphasisSkip = 1;
  }

  #skip(samples: Float32Array, pending: number): Float32Array {
    return samples.subarray(Math.min(pending, samples.length));
  }

  /**
   * Runs `audio` (mono, -1..1) through the chain and returns the pulse train:
   * 1 during a pulse, else 0. It is as long as the audio, minus what #skip drops.
   */
  process(audio: Float32Array): Float32Array {
    const { filters } = this.#config;
    let samples: Float32Array = audio.slice();

    this.#dcBlocker.process(samples);
    if (filters.notch) this.#notch.process(samples);
    this.#hpf.process(samples);
    this.#lpf.process(samples);
    this.#f1.process(samples, !filters.f1Bandpass);
    if (this.#f1Skip > 0) {
      const kept = this.#skip(samples, this.#f1Skip);
      this.#f1Skip -= samples.length - kept.length;
      samples = kept;
    }
    if (filters.fricative) this.#fricative.process(samples);
    this.#preEmphasis(samples, filters.preEmphasis);
    if (this.#preEmphasisSkip > 0) {
      const kept = this.#skip(samples, this.#preEmphasisSkip);
      this.#preEmphasisSkip -= samples.length - kept.length;
      samples = kept;
    }
    // De-emphasis does nothing here, as in the reference: GNU Radio's old-style
    // IIR ignores the single feedback tap the app gives it, and the catalog's
    // de_emph files are identical to the ones without it.
    this.#agc(samples);
    if (filters.noiseGate) this.#noiseGate.process(samples);
    if (filters.envelopeFollower) this.#envelopeFollower.process(samples);
    if (filters.spectralSub) this.#spectralSub.process(samples);
    if (filters.decimate) this.#decimator.process(samples);
    if (filters.halfWave) halfWaveRectify(samples);
    if (filters.schmitt) this.#schmitt.process(samples);
    if (filters.hilbert) this.#hilbert.process(samples);
    this.#pulse.process(samples);
    return samples.slice();
  }

  /** y[n] = x[n] - 0.5·x[n-1]. */
  #preEmphasis(samples: Float32Array, enabled: boolean) {
    let last = this.#preEmphasisLast;
    for (let i = 0; i < samples.length; i++) {
      const x = samples[i];
      if (enabled) samples[i] = x - 0.5 * last;
      last = x;
    }
    this.#preEmphasisLast = last;
  }

  /** GNU Radio's agc_ff, in single precision like the original. */
  #agc(samples: Float32Array) {
    let gain = this.#agcGain;
    for (let i = 0; i < samples.length; i++) {
      const out = fround(samples[i] * gain);
      samples[i] = out;
      gain = fround(gain + fround(fround(AGC_REFERENCE - Math.abs(out)) * AGC_RATE));
      if (gain > AGC_MAX_GAIN) gain = AGC_MAX_GAIN;
    }
    this.#agcGain = gain;
  }
}

/** Share of samples that are inside a pulse, 0..1. */
export function dutyCycle(pulses: Float32Array, start = 0, end = pulses.length): number {
  let on = 0;
  for (let i = start; i < end; i++) if (pulses[i] > 0) on++;
  return end > start ? on / (end - start) : 0;
}
