// Transmit a 1 kHz test tone, then put the transmitter back as it was.
//   node cli/tx.ts 433.92e6               10 s of FM at the lowest output level
//   node cli/tx.ts 433.92e6 30 -40        30 s with 40 dB of attenuation
//   node cli/tx.ts 433.92e6 30 -40 am     the same as AM
// Only transmit where you are allowed to, and start from the lowest level.
import { MAX_ATTENUATION_DB } from "../src/sdr/pluto.ts";
import { BANDWIDTH, CHUNK_SAMPLES, isModulation, modulate, tone } from "./modulation.ts";
import { connectTcp } from "./tcp.ts";
import { transmit } from "./transmit.ts";

const TONE_HZ = 1000;

const [frequencyArg, secondsArg = "10", attenuationArg = String(MAX_ATTENUATION_DB), mode = "fm"] = process.argv.slice(2);
const frequency = Math.round(Number(frequencyArg));
const seconds = Number(secondsArg);
const attenuation = Number(attenuationArg);
if (!(frequency > 0) || !(seconds > 0) || !(attenuation >= MAX_ATTENUATION_DB && attenuation <= 0) || !isModulation(mode)) {
  console.error("usage: node cli/tx.ts <frequencyHz> [seconds] [attenuationDb -89.75..0] [fm|am]");
  process.exit(1);
}

const sdr = await connectTcp();
try {
  console.log(`${TONE_HZ} Hz ${mode.toUpperCase()} tone for ${seconds} s`);
  const audio = tone(TONE_HZ, seconds);
  await transmit(sdr, { frequency, gain: attenuation, bandwidth: BANDWIDTH, chunkSamples: CHUNK_SAMPLES }, (rate, chunk) =>
    modulate(audio, mode, rate, chunk),
  );
} finally {
  sdr.close();
}
