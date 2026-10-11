// Runs the chain off the main thread: whole utterances through a fresh chain,
// microphone blocks through one that keeps running.
import { type ChainProbe, STAGES, type StageId, ZcpChain } from "../dsp/chain.ts";
import { FFT_SIZE, analyse } from "../dsp/spectrogram.ts";
import { ROLLING_FRAMES_PER_COLUMN, RollingWaterfall, levelByte } from "../dsp/waterfall.ts";
import type { DspAnswer, DspCall, DspReply, DspRequest, LiveReply, LiveRequest, RenderReply, RenderRequest, Tap, WaterfallReply } from "./protocol.ts";

let live: ZcpChain | undefined;
let rolling: RollingWaterfall | undefined;
let rolled: number[] = [];

/** A probe that measures every stage's peak and keeps the stages in `wanted`. */
function watch(wanted: "all" | StageId[] = []) {
  const peaks = new Float32Array(STAGES.length).fill(Number.NaN);
  const taps: Tap[] = [];
  const probe: ChainProbe = {
    stage(stage, samples, skipped) {
      let peak = 0;
      for (let n = 0; n < samples.length; n++) peak = Math.max(peak, Math.abs(samples[n]));
      peaks[STAGES.indexOf(stage)] = peak;
      if (wanted === "all" || wanted.includes(stage)) taps.push({ stage, samples, skipped });
    },
  };
  return { probe, peaks, taps };
}

function render({ audio, config, spectrogram, taps: wanted }: RenderRequest): RenderReply {
  const chain = new ZcpChain(config);
  const { probe, peaks, taps } = watch(wanted);
  let agcGain: Float32Array | undefined;
  if (wanted) probe.agcGain = (gain) => (agcGain = gain);
  const pulses = chain.process(audio, probe);
  const reply: RenderReply = { pulses, pulseCount: chain.pulseCount, peaks, taps, agcGain };
  if (spectrogram) reply.spectrogram = analyse(pulses) ?? null;
  return reply;
}

function next({ audio, config, tap }: LiveRequest): LiveReply {
  live ??= new ZcpChain(config);
  live.setConfig(config);
  const before = live.pulseCount;
  const { probe, peaks, taps } = watch(tap ? [tap] : []);
  const pulses = live.process(audio, probe);
  return { pulses, pulseCount: live.pulseCount - before, peaks, tap: taps[0], agcGain: live.agcGain };
}

function roll(pulses: Float32Array): WaterfallReply {
  rolling ??= new RollingWaterfall(ROLLING_FRAMES_PER_COLUMN, (db) => {
    for (let bin = 0; bin < FFT_SIZE; bin++) rolled.push(levelByte(db[bin]));
  });
  rolled = [];
  rolling.push(pulses);
  return { columns: Uint8Array.from(rolled) };
}

function answer(request: DspRequest): DspReply<DspRequest> {
  if (request.kind === "render") return render(request);
  if (request.kind === "live") return next(request);
  if (request.kind === "waterfall") return roll(request.pulses);
  return { spectrogram: analyse(request.pulses) ?? null };
}

/** The buffers of a reply, which move to the main thread instead of being copied. */
function buffers(reply: DspReply<DspRequest>): Transferable[] {
  const found: Transferable[] = [];
  if ("pulses" in reply) found.push(reply.pulses.buffer, reply.peaks.buffer);
  if ("taps" in reply) found.push(...reply.taps.map((tap) => tap.samples.buffer));
  if ("tap" in reply && reply.tap) found.push(reply.tap.samples.buffer);
  if ("agcGain" in reply && reply.agcGain instanceof Float32Array) found.push(reply.agcGain.buffer);
  if ("spectrogram" in reply && reply.spectrogram) found.push(reply.spectrogram.db.buffer);
  if ("columns" in reply) found.push(reply.columns.buffer);
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
