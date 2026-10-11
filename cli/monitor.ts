// Listens the way the app's receive monitor does and reports the pulses it
// hears, then puts the receiver back as it was. It never transmits.
//   node cli/monitor.ts 1300e6          listen on 1300 MHz for 2 s at 20 dB gain
//   node cli/monitor.ts 1300e6 5 40     5 s at 40 dB
import { PulseDetector } from "../src/dsp/detect.ts";
import { MAX_RX_GAIN_DB, PlutoRx } from "../src/sdr/pluto.ts";
import { connectTcp } from "./tcp.ts";

const [frequencyArg, secondsArg = "2", gainArg = "20"] = process.argv.slice(2);
const frequency = Math.round(Number(frequencyArg));
const seconds = Number(secondsArg);
const gain = Number(gainArg);
if (!(frequency > 0) || !(seconds > 0) || !(gain >= 0 && gain <= MAX_RX_GAIN_DB)) {
  console.error(`usage: node cli/monitor.ts <frequencyHz> [seconds] [gainDb 0..${MAX_RX_GAIN_DB}]`);
  process.exit(1);
}

const sdr = await connectTcp();
const rx = new PlutoRx(sdr, sdr);
try {
  const { sampleRate, blockSamples, fullScale } = await rx.start({ frequency, gain, ownsRate: true });
  console.log(`listening on ${(frequency / 1e6).toFixed(3)} MHz at ${(sampleRate / 1e6).toFixed(3)} MS/s, ${gain} dB gain`);
  const detector = new PulseDetector(sampleRate);
  const dbfs = (level: number) => (level > 0 ? `${(20 * Math.log10(level / fullScale)).toFixed(1)} dBFS` : "-");
  let pulses = 0;
  let inside = 0;
  let samples = 0;
  let last = { noise: 0, peak: 0, rms: 0, largest: 0 };
  const started = Date.now();
  while (samples < seconds * sampleRate) {
    const found = detector.push(await rx.read());
    pulses += found.onsets.length;
    inside += found.duty * blockSamples;
    samples += blockSamples;
    last = found;
  }
  const took = (Date.now() - started) / 1000;
  console.log({
    seconds: samples / sampleRate,
    readIn: `${took.toFixed(2)} s`,
    level: dbfs(last.rms),
    noise: dbfs(last.noise),
    pulseLevel: dbfs(last.peak),
    largestSample: dbfs(last.largest),
    pulses,
    pulsesPerSecond: Math.round((pulses * sampleRate) / samples),
    dutyCycle: `${((100 * inside) / samples).toFixed(2)} %`,
  });
} finally {
  await rx.stop();
  sdr.close();
  console.log("receiver restored");
}
