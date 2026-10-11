// Runs the chain off the main thread: whole utterances through a fresh chain,
// microphone blocks through one that keeps running.
import { ZcpChain } from "../dsp/chain.ts";
import { analyse } from "../dsp/spectrogram.ts";
import type { DspAnswer, DspCall, DspReply, DspRequest, LiveRequest, RenderRequest } from "./protocol.ts";

let live: ZcpChain | undefined;

function render({ audio, config, spectrogram }: RenderRequest): DspReply<RenderRequest> {
  const chain = new ZcpChain(config);
  const pulses = chain.process(audio);
  const reply: DspReply<RenderRequest> = { pulses, pulseCount: chain.pulseCount };
  if (spectrogram) reply.spectrogram = analyse(pulses) ?? null;
  return reply;
}

function next({ audio, config }: LiveRequest): DspReply<LiveRequest> {
  live ??= new ZcpChain(config);
  live.setConfig(config);
  const before = live.pulseCount;
  const pulses = live.process(audio);
  return { pulses, pulseCount: live.pulseCount - before };
}

function answer(request: DspRequest): DspReply<DspRequest> {
  if (request.kind === "render") return render(request);
  if (request.kind === "live") return next(request);
  return { spectrogram: analyse(request.pulses) ?? null };
}

/** The buffers of a reply, which move to the main thread instead of being copied. */
function buffers(reply: DspReply<DspRequest>): Transferable[] {
  const found: Transferable[] = [];
  if ("pulses" in reply) found.push(reply.pulses.buffer);
  if ("spectrogram" in reply && reply.spectrogram) found.push(reply.spectrogram.db.buffer);
  return found;
}

addEventListener("message", ({ data: { id, request } }: MessageEvent<DspCall>) => {
  let result: DspAnswer;
  try {
    result = { id, reply: answer(request) };
  } catch (error) {
    result = { id, error: error instanceof Error ? error.message : String(error) };
  }
  postMessage(result, { transfer: "reply" in result ? buffers(result.reply) : [] });
});
