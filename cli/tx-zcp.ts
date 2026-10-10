// Send a WAV file as zero-crossing pulses, then put the transmitter back as it was.
//   node cli/tx-zcp.ts 1300e6 clip.wav                     the app's default filters, lowest output level
//   node cli/tx-zcp.ts 1300e6 clip.wav -40                 40 dB of attenuation
//   node cli/tx-zcp.ts 1300e6 clip.wav -40 baseline        no optional filter
//   node cli/tx-zcp.ts 1300e6 clip.wav -40 notch+schmitt   filters by their catalog names
// Only transmit where you are allowed to, and start from the lowest level.
import { readFileSync } from "node:fs";
import { ZcpChain, dutyCycle } from "../src/dsp/chain.ts";
import { AUDIO_RATE, FILTERS, appDefaults, filtersFromLabel } from "../src/dsp/config.ts";
import { IqHolder, PulseQueue } from "../src/dsp/resample.ts";
import { decodeWav, resample } from "../src/dsp/wav.ts";
import { MAX_ATTENUATION_DB } from "../src/sdr/pluto.ts";
import { connectTcp } from "./tcp.ts";
import { transmit } from "./transmit.ts";

const TAIL_SECONDS = 0.5; // silence while the board plays out what is still queued

const [frequencyArg, file, attenuationArg = String(MAX_ATTENUATION_DB), label] = process.argv.slice(2);
const frequency = Math.round(Number(frequencyArg));
const attenuation = Number(attenuationArg);
const config = appDefaults();
const filters = label === undefined ? config.filters : filtersFromLabel(label);
if (!(frequency > 0) || !file || !(attenuation >= MAX_ATTENUATION_DB && attenuation <= 0) || !filters) {
  console.error("usage: node cli/tx-zcp.ts <frequencyHz> <file.wav> [attenuationDb -89.75..0] [baseline|filter+filter...]");
  console.error(`filters: ${FILTERS.map(({ catalog }) => catalog).join(" ")}`);
  process.exit(1);
}

const audio = resample(decodeWav(readFileSync(file)), AUDIO_RATE).samples;
const chain = new ZcpChain({ ...config, filters });
const pulses = chain.process(audio);
console.log(
  `${file}: ${(audio.length / AUDIO_RATE).toFixed(1)} s, ${chain.pulseCount} pulses, duty cycle ${(100 * dutyCycle(pulses)).toFixed(2)} %`,
);

const sdr = await connectTcp();
try {
  await transmit(sdr, { frequency, gain: attenuation }, function* (rate, chunk) {
    const holder = new IqHolder(rate, "s16");
    const queue = new PulseQueue();
    queue.push(pulses);
    queue.push(new Float32Array(AUDIO_RATE * TAIL_SECONDS));
    while (queue.length > 0) yield holder.render(queue.pull(holder.inputNeeded(chunk)), chunk);
  });
} finally {
  sdr.close();
}
