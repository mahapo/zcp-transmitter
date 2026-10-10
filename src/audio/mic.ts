// Live microphone capture at the chain's sample rate.
import { AUDIO_RATE } from "../dsp/config.ts";
// The worklet must stay a file of its own; small assets would otherwise be inlined.
import captureUrl from "./capture.worklet.js?url&no-inline";

export interface Mic {
  stop(): void;
}

/** Starts the microphone and hands its audio to `onBlock` in 50 ms blocks. Asks for permission on first use. */
export async function startMic(onBlock: (samples: Float32Array) => void): Promise<Mic> {
  // The chain does its own conditioning, so the browser's is switched off.
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const context = new AudioContext({ sampleRate: AUDIO_RATE });
  const stop = () => {
    for (const track of stream.getTracks()) track.stop();
    void context.close();
  };
  try {
    await context.audioWorklet.addModule(captureUrl);
    const capture = new AudioWorkletNode(context, "capture", { numberOfInputs: 1, numberOfOutputs: 0 });
    capture.port.onmessage = ({ data }: MessageEvent<Float32Array>) => onBlock(data);
    context.createMediaStreamSource(stream).connect(capture);
  } catch (error) {
    stop();
    throw error;
  }
  return { stop };
}

/** RMS level in dB relative to full scale, not below `floor`. */
export function levelDb(samples: Float32Array, floor = -60): number {
  let power = 0;
  for (const sample of samples) power += sample * sample;
  return Math.max(floor, 10 * Math.log10(power / samples.length + 1e-12));
}
