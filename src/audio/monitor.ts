// Listening to the signal over the loudspeaker. Nothing here has to do with
// the transmitter: it is the browser's ordinary audio output.
import { AUDIO_RATE } from "../dsp/config.ts";
// The worklet must stay a file of its own; small assets would otherwise be inlined.
import playerUrl from "./player.worklet.js?url&no-inline";

let context: AudioContext | undefined;
let output: GainNode | undefined;

/** The audio output at the chain's sample rate, created on first use, which must follow a user's action. */
function audio(): { context: AudioContext; output: GainNode } {
  context ??= new AudioContext({ sampleRate: AUDIO_RATE });
  if (!output) {
    output = context.createGain();
    output.connect(context.destination);
  }
  void context.resume();
  return { context, output };
}

/** Volume from 0 to 1, for everything that plays. */
export function setVolume(volume: number) {
  if (output) output.gain.value = volume;
}

export interface Playback {
  stop(): void;
  /** Samples played so far. */
  position(): number;
  /** Resolves when the samples have run out or `stop` was called. */
  ended: Promise<void>;
}

/** Plays `samples` (48 kHz, -1..1) once. */
export function playSamples(samples: Float32Array, volume: number): Playback {
  const { context, output } = audio();
  output.gain.value = volume;
  const buffer = context.createBuffer(1, Math.max(1, samples.length), AUDIO_RATE);
  buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(output);
  const startsAt = context.currentTime + 0.03;
  source.start(startsAt);
  const ended = new Promise<void>((resolve) => (source.onended = () => resolve()));
  return {
    stop: () => source.stop(),
    position: () => Math.max(0, Math.min(samples.length, Math.round((context.currentTime - startsAt) * AUDIO_RATE))),
    ended,
  };
}

export interface LiveMonitor {
  /** Queues the next block; it is played right after the ones before it. */
  push(samples: Float32Array): void;
  stop(): void;
}

/** Starts playing blocks as they are pushed, about a tenth of a second behind. */
export async function startLiveMonitor(volume: number): Promise<LiveMonitor> {
  const { context, output } = audio();
  output.gain.value = volume;
  await context.audioWorklet.addModule(playerUrl);
  const player = new AudioWorkletNode(context, "player", { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] });
  player.connect(output);
  return {
    push(samples) {
      const copy = samples.slice();
      player.port.postMessage(copy, [copy.buffer]);
    },
    stop: () => player.disconnect(),
  };
}
