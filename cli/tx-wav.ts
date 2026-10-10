// Play a WAV file over the air, then put the transmitter back as it was.
//   node cli/tx-wav.ts 433.92e6 clip.wav           FM at the lowest output level
//   node cli/tx-wav.ts 433.92e6 clip.wav -40       40 dB of attenuation
//   node cli/tx-wav.ts 433.92e6 clip.wav -40 am    the same as AM
// Only transmit where you are allowed to, and start from the lowest level.
import { readFileSync } from "node:fs";
import { decodeWav } from "../src/dsp/wav.ts";
import { MAX_ATTENUATION_DB } from "../src/sdr/pluto.ts";
import { BANDWIDTH, CHUNK_SAMPLES, isModulation, modulate, shapeAudio } from "./modulation.ts";
import { connectTcp } from "./tcp.ts";
import { transmit } from "./transmit.ts";

const [frequencyArg, file, attenuationArg = String(MAX_ATTENUATION_DB), mode = "fm"] = process.argv.slice(2);
const frequency = Math.round(Number(frequencyArg));
const attenuation = Number(attenuationArg);
if (!(frequency > 0) || !file || !(attenuation >= MAX_ATTENUATION_DB && attenuation <= 0) || !isModulation(mode)) {
  console.error("usage: node cli/tx-wav.ts <frequencyHz> <file.wav> [attenuationDb -89.75..0] [fm|am]");
  process.exit(1);
}

const audio = shapeAudio(decodeWav(readFileSync(file)), mode);
const sdr = await connectTcp();
try {
  console.log(`playing ${file} as ${mode.toUpperCase()} (${(audio.samples.length / audio.sampleRate).toFixed(1)} s)`);
  await transmit(sdr, { frequency, gain: attenuation, bandwidth: BANDWIDTH, chunkSamples: CHUNK_SAMPLES }, (rate, chunk) =>
    modulate(audio, mode, rate, chunk),
  );
} finally {
  sdr.close();
}
