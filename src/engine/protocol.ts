// What the main thread and a DSP worker say to each other.
import type { StageId } from "../dsp/chain.ts";
import type { ChainConfig } from "../dsp/config.ts";
import type { SpectrogramData } from "../dsp/spectrogram.ts";

/** The output of one stage of the chain. Sample `n` belongs to input sample `n + skipped` of its block. */
export interface Tap {
  stage: StageId;
  samples: Float32Array;
  skipped: number;
}

/** One utterance through a fresh chain, as the catalog generator runs it. */
export interface RenderRequest {
  kind: "render";
  audio: Float32Array;
  config: ChainConfig;
  spectrogram: boolean;
  /** The stages to return along with the pulses. */
  taps?: "all" | StageId[];
}

/** The next block of a continuous stream, through a chain that keeps running. */
export interface LiveRequest {
  kind: "live";
  audio: Float32Array;
  config: ChainConfig;
  /** The stage to return along with the pulses. */
  tap?: StageId;
}

/** The waterfall of pulses that already exist. */
export interface SpectrogramRequest {
  kind: "spectrogram";
  pulses: Float32Array;
}

export type DspRequest = RenderRequest | LiveRequest | SpectrogramRequest;

export interface PulsesReply {
  pulses: Float32Array;
  /** Zero crossings that triggered a pulse. */
  pulseCount: number;
  /** The largest magnitude at each of STAGES, NaN where a filter is off. */
  peaks: Float32Array;
}

export interface SpectrogramReply {
  /** Null when there is no pulse to show. */
  spectrogram: SpectrogramData | null;
}

export interface RenderReply extends PulsesReply, Partial<SpectrogramReply> {
  taps: Tap[];
  /** The gain the AGC applied to each sample, when taps were asked for. */
  agcGain?: Float32Array;
}

export interface LiveReply extends PulsesReply {
  tap?: Tap;
  /** The AGC's gain after this block. */
  agcGain: number;
}

export type DspReply<R extends DspRequest> = R extends RenderRequest ? RenderReply : R extends LiveRequest ? LiveReply : SpectrogramReply;

export interface DspCall {
  id: number;
  request: DspRequest;
}

export type DspAnswer = { id: number; reply: DspReply<DspRequest> } | { id: number; error: string };
