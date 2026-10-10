// Runs the chain off the main thread: whole utterances through a fresh chain,
// microphone blocks through one that keeps running.
import { ZcpChain } from "../dsp/chain.ts";
import type { ChainConfig } from "../dsp/config.ts";

export interface DspRequest {
  id: number;
  /** "render" = a fresh chain for one utterance, "live" = the next block of a continuous stream. */
  kind: "render" | "live";
  audio: Float32Array;
  config: ChainConfig;
}

export interface DspReply {
  id: number;
  pulses: Float32Array;
  pulseCount: number;
}

let live: ZcpChain | undefined;

addEventListener("message", ({ data }: MessageEvent<DspRequest>) => {
  const { id, kind, audio, config } = data;
  let chain: ZcpChain;
  if (kind === "render") {
    chain = new ZcpChain(config);
  } else {
    live ??= new ZcpChain(config);
    live.setConfig(config);
    chain = live;
  }
  const before = chain.pulseCount;
  const pulses = chain.process(audio);
  const reply: DspReply = { id, pulses, pulseCount: chain.pulseCount - before };
  postMessage(reply, { transfer: [pulses.buffer] });
});
