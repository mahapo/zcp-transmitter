// Audio files as chain input.
import { AUDIO_RATE } from "../dsp/config.ts";
import { decodeWav, resample } from "../dsp/wav.ts";

/** Decodes an audio file to mono at the chain's rate: 16-bit WAV exactly, anything else through the browser. */
export async function decodeFile(data: ArrayBuffer): Promise<Float32Array> {
  try {
    return resample(decodeWav(new Uint8Array(data)), AUDIO_RATE).samples;
  } catch {
    const decoded = await new OfflineAudioContext(1, 1, AUDIO_RATE).decodeAudioData(data);
    const mono = new Float32Array(decoded.length);
    for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
      const samples = decoded.getChannelData(channel);
      for (let n = 0; n < mono.length; n++) mono[n] += samples[n] / decoded.numberOfChannels;
    }
    return mono;
  }
}
