// What the main thread and a DSP worker say to each other.
import type { ChainConfig } from "../dsp/config.ts";
import type { SpectrogramData } from "../dsp/spectrogram.ts";

/** One utterance through a fresh chain, as the catalog generator runs it. */
export interface RenderRequest {
  kind: "render";
  audio: Float32Array;
  config: ChainConfig;
  spectrogram: boolean;
}

/** The next block of a continuous stream, through a chain that keeps running. */
export interface LiveRequest {
  kind: "live";
  audio: Float32Array;
  config: ChainConfig;
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
}

export interface SpectrogramReply {
  /** Null when there is no pulse to show. */
  spectrogram: SpectrogramData | null;
}

export type DspReply<R extends DspRequest> = R extends RenderRequest
  ? PulsesReply & Partial<SpectrogramReply>
  : R extends LiveRequest
    ? PulsesReply
    : SpectrogramReply;

export interface DspCall {
  id: number;
  request: DspRequest;
}

export type DspAnswer = { id: number; reply: DspReply<DspRequest> } | { id: number; error: string };
