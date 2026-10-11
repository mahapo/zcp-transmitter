// Runs the chain off the main thread: whole utterances through a fresh chain,
// microphone blocks through one that keeps running.
import { matchReference } from "../catalog/reference.ts";
import { pulseEdges } from "../dsp/analysis.ts";
import { type ChainProbe, STAGES, type StageId, ZcpChain, dutyCycle } from "../dsp/chain.ts";
import { AUDIO_RATE, CATALOG_RATE } from "../dsp/config.ts";
import { FFT_SIZE, HOP, analyse } from "../dsp/spectrogram.ts";
import { ROLLING_FRAMES_PER_COLUMN, RollingWaterfall, levelByte } from "../dsp/waterfall.ts";
import type { DspAnswer, DspCall, DspReply, DspRequest, LabReply, LabRequest, LiveReply, LiveRequest, RenderReply, RenderRequest, Tap, WaterfallReply } from "./protocol.ts";

let live: ZcpChain | undefined;
let rolling: RollingWaterfall | undefined;
let rolled: number[] = [];
let labAudio: Float32Array = new Float32Array(0);

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

/** One catalog configuration over the lab's utterance: its pulses, a thumbnail and how it compares with the catalog. */
async function lab({ config, columns, reference }: LabRequest): Promise<LabReply> {
  const chain = new ZcpChain(config);
  const pulses = chain.process(labAudio);
  const skipped = labAudio.length - pulses.length;
  // On the input's time axis, so that every configuration lines up with every other.
  const timed = new Float32Array(labAudio.length);
  timed.set(pulses, skipped);

  const frames = Math.floor((Math.ceil((timed.length * CATALOG_RATE) / AUDIO_RATE) - FFT_SIZE) / HOP) + 1;
  const levels: number[] = [];
  new RollingWaterfall(Math.max(1, Math.ceil(frames / columns)), (db) => {
    for (let bin = 0; bin < FFT_SIZE; bin++) levels.push(levelByte(db[bin]));
  }).push(timed);

  return {
    pulseCount: chain.pulseCount,
    duty: dutyCycle(pulses),
    skipped,
    edges: pulseEdges(timed),
    thumb: Uint8Array.from(levels),
    columns: levels.length / FFT_SIZE,
    match: reference && (await matchReference(pulses, reference)),
  };
}

function answer(request: DspRequest): DspReply<DspRequest> | Promise<DspReply<DspRequest>> {
  if (request.kind === "render") return render(request);
  if (request.kind === "live") return next(request);
  if (request.kind === "waterfall") return roll(request.pulses);
  if (request.kind === "lab") return lab(request);
  if (request.kind === "labAudio") {
    labAudio = request.audio;
    return {};
  }
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
  if ("columns" in reply && reply.columns instanceof Uint8Array) found.push(reply.columns.buffer);
  if ("thumb" in reply) found.push(reply.thumb.buffer, reply.edges.buffer);
  return found;
}

addEventListener("message", async ({ data: { id, request } }: MessageEvent<DspCall>) => {
  let result: DspAnswer;
  try {
    result = { id, reply: await answer(request) };
  } catch (error) {
    result = { id, error: error instanceof Error ? error.message : String(error) };
  }
  postMessage(result, { transfer: "reply" in result ? buffers(result.reply) : [] });
});
