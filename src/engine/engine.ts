// Connects the audio sources, the chain and the outputs, and keeps `state` up to date.
import { markRaw } from "vue";
import { decodeFile } from "../audio/file.ts";
import { type Mic, levelDb, startMic } from "../audio/mic.ts";
import { synthesize } from "../audio/tts.ts";
import { dutyCycle } from "../dsp/chain.ts";
import { AUDIO_RATE, CATALOG_RATE, type ChainConfig, catalogLabel } from "../dsp/config.ts";
import { IqHolder, PulseQueue, outputLength } from "../dsp/resample.ts";
import { spectrogram } from "../dsp/spectrogram.ts";
import { prepareUtterance } from "../dsp/wav.ts";
import { type SdrDevice, requestSdr, webUsbAvailable } from "../sdr/device.ts";
import { state } from "../state.ts";
import type { DspReply, DspRequest } from "./dsp.worker.ts";

const METER_SAMPLES = AUDIO_RATE / 10; // duty cycle is measured over 100 ms
const METER_HOLD_MS = 400; // the live meter falls back to zero after this long without pulses
const MAX_RECORD_SECONDS = 30; // 16 MB per second
const MAX_BACKLOG_SECONDS = 2; // of microphone pulses waiting for the transmitter
const TAIL_SECONDS = 0.5; // silence while the device plays out what is still queued

// --- the chain, in its worker -----------------------------------------------

const worker = new Worker(new URL("./dsp.worker.ts", import.meta.url), { type: "module" });
const waiting = new Map<number, (reply: DspReply) => void>();
let requests = 0;
worker.onmessage = ({ data }: MessageEvent<DspReply>) => {
  waiting.get(data.id)?.(data);
  waiting.delete(data.id);
};
worker.onerror = (event) => fail(new Error(event.message));

function runChain(kind: DspRequest["kind"], audio: Float32Array): Promise<DspReply> {
  // A plain copy: the reactive config cannot cross to the worker.
  const config: ChainConfig = { ...state.config, filters: { ...state.config.filters } };
  const request: DspRequest = { id: requests++, kind, audio, config };
  return new Promise((resolve) => {
    waiting.set(request.id, resolve);
    worker.postMessage(request, [audio.buffer]);
  });
}

// --- status -----------------------------------------------------------------

function say(message: string) {
  state.message = message;
  state.failed = false;
}

function fail(error: unknown) {
  state.message = error instanceof Error ? error.message : String(error);
  state.failed = true;
}

// --- pulses on their way out ------------------------------------------------

const queue = new PulseQueue(); // waiting for the transmitter
let recorded: Float32Array[] = [];
let meterTimer: ReturnType<typeof setTimeout> | undefined;

/** Shows the duty cycle of `pulses`, 100 ms at a time. */
function meter(pulses: Float32Array) {
  for (let start = 0; start < pulses.length; start += METER_SAMPLES) {
    state.dutyLive = dutyCycle(pulses, start, Math.min(pulses.length, start + METER_SAMPLES));
    state.dutyPeak = Math.max(state.dutyPeak, state.dutyLive);
  }
  clearTimeout(meterTimer);
  meterTimer = setTimeout(() => (state.dutyLive = 0), METER_HOLD_MS);
}

/** Sends freshly made pulses wherever they are wanted. */
function emit(pulses: Float32Array, pulseCount: number) {
  state.pulses += pulseCount;
  if (state.tx === "on") queue.push(pulses);
  else meter(pulses); // while transmitting the meter shows what goes on air
  if (state.recording) {
    recorded.push(pulses);
    state.recordedSeconds += pulses.length / AUDIO_RATE;
    if (state.recordedSeconds >= MAX_RECORD_SECONDS) stopRecording();
  }
}

function showSpectrogram(pulses: Float32Array, title: string) {
  const data = spectrogram(pulses);
  state.spectrogram = data ? { title, data: markRaw(data) } : null;
}

// --- Audio Input ------------------------------------------------------------

/** Runs one utterance (48 kHz) through a fresh chain, as the catalog generator does. */
async function play(audio: Float32Array, title: string) {
  const seconds = audio.length / AUDIO_RATE;
  const { pulses, pulseCount } = await runChain("render", audio);
  emit(pulses, pulseCount);
  if (state.makeSpectrogram && !state.recording) showSpectrogram(pulses, title);
  say(`${title}: ${seconds.toFixed(2)} s, ${pulseCount} pulses, duty cycle ${(100 * dutyCycle(pulses)).toFixed(2)} %`);
}

export async function generateVoice() {
  const text = state.text.trim();
  if (!text || state.generating) return;
  state.generating = true;
  try {
    await play(prepareUtterance(await synthesize(text, state.voice)), `"${text}"`);
  } catch (error) {
    fail(error);
  } finally {
    state.generating = false;
  }
}

export async function playFile(file: File) {
  try {
    await play(await decodeFile(await file.arrayBuffer()), file.name);
  } catch (error) {
    fail(error);
  }
}

/** The utterance the reference catalog was generated from ("Test", already padded with silence). */
export async function playReferenceSample() {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}samples/test-48k.wav`);
    await play(await decodeFile(await response.arrayBuffer()), "reference sample");
  } catch (error) {
    fail(error);
  }
}

let mic: Mic | undefined;

export async function toggleMic() {
  if (mic) {
    mic.stop();
    mic = undefined;
    state.micOn = false;
    state.micDb = -60;
    return;
  }
  try {
    mic = await startMic(async (samples) => {
      state.micDb = levelDb(samples);
      const backlogged = queue.length > MAX_BACKLOG_SECONDS * AUDIO_RATE;
      const { pulses, pulseCount } = await runChain("live", samples);
      if (state.micOn && !backlogged) emit(pulses, pulseCount);
    });
    state.micOn = true;
  } catch (error) {
    fail(new Error(`microphone: ${error instanceof Error ? error.message : error}`));
  }
}

// --- Output: SDR ------------------------------------------------------------

let device: SdrDevice | undefined;

export async function connectSdr() {
  if (state.connecting) return;
  state.connecting = true;
  try {
    await disconnectSdr();
    device = await requestSdr();
    state.device = { name: device.name, caps: device.caps };
    state.gain = device.caps.gain.initial;
    say(`${device.name} connected`);
  } catch (error) {
    // Closing the browser's device chooser is not an error.
    if (!(error instanceof DOMException && error.name === "NotFoundError")) fail(error);
  } finally {
    state.connecting = false;
  }
}

export async function disconnectSdr() {
  if (!device) return;
  await stopTx();
  await device.close().catch(() => {});
  device = undefined;
  state.device = null;
}

// An unplugged SDR is gone for good; the transmit loop ends by itself on its failed write.
if (webUsbAvailable()) {
  navigator.usb.addEventListener("disconnect", () => {
    if (!device) return;
    device = undefined;
    state.device = null;
    fail(new Error("the SDR was disconnected"));
  });
}

let transmitting: Promise<void> | undefined;

async function transmit(sdr: SdrDevice) {
  const { sampleRate, chunkSamples } = await sdr.startTx({ frequency: state.frequencyHz, gain: state.gain });
  try {
    const holder = new IqHolder(sampleRate, sdr.caps.format);
    const next = () => {
      const pulses = queue.pull(holder.inputNeeded(chunkSamples));
      meter(pulses);
      return holder.render(pulses, chunkSamples);
    };
    queue.clear();
    if (state.tx === "starting") state.tx = "on"; // unless it was stopped meanwhile
    say(`on air: ${(state.frequencyHz / 1e6).toFixed(3)} MHz at ${(sampleRate / 1e6).toFixed(3)} MS/s`);
    // The device takes a chunk when it has room for it, which paces this loop in real time.
    while (state.tx === "on") await sdr.write(next());
    queue.clear();
    for (let sent = 0; sent < TAIL_SECONDS * sampleRate; sent += chunkSamples) await sdr.write(next());
  } finally {
    await sdr.stopTx();
  }
}

export function startTx() {
  if (!device || state.tx !== "off") return;
  state.tx = "starting";
  transmitting = transmit(device)
    .then(() => say("transmitter stopped and restored"))
    .catch(fail)
    .finally(() => {
      state.tx = "off";
      queue.clear();
    });
}

export async function stopTx() {
  if (state.tx === "on" || state.tx === "starting") state.tx = "stopping";
  await transmitting;
}

/** Applies a changed power setting, also while on air. */
export async function setGain(gain: number) {
  state.gain = gain;
  if (state.tx === "on") await device?.setGain(gain).catch(fail);
}

// --- Output: disk -----------------------------------------------------------

/** Hands `blob` to the browser as a file download. */
export function download(blob: Blob, name: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
}

/** The local date and time, fit for a file name. */
export function fileStamp(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 19).replace(/[:T]/g, "-");
}

export function startRecording() {
  recorded = [];
  state.recordedSeconds = 0;
  state.recording = true;
  say("recording: speak or press Generate Voice, then stop to save");
}

/** Saves what was recorded as complex64 IQ at 2 MS/s (I = pulses, Q = 0), the format of the catalog. */
export function stopRecording() {
  if (!state.recording) return;
  state.recording = false;
  const length = recorded.reduce((sum, part) => sum + part.length, 0);
  if (length === 0) return say("nothing was recorded");
  const pulses = new Float32Array(length);
  let offset = 0;
  for (const part of recorded) {
    pulses.set(part, offset);
    offset += part.length;
  }
  recorded = [];

  // One second at a time, so a long recording is never one giant array.
  const holder = new IqHolder(CATALOG_RATE, "cf32");
  const parts: BlobPart[] = [];
  for (let start = 0; start < length; start += AUDIO_RATE) {
    const second = pulses.subarray(start, Math.min(length, start + AUDIO_RATE));
    parts.push(holder.render(second, outputLength(second.length, CATALOG_RATE)) as Float32Array<ArrayBuffer>);
  }
  const name = `zcp_${catalogLabel(state.config.filters)}_${fileStamp()}.iq`;
  download(new Blob(parts, { type: "application/octet-stream" }), name);
  if (state.makeSpectrogram) showSpectrogram(pulses, name);
  say(`saved ${name}: ${(length / AUDIO_RATE).toFixed(2)} s`);
}

// A closed tab cannot restore the SDR, so warn before leaving while on air.
addEventListener("beforeunload", (event) => {
  if (state.tx !== "off") event.preventDefault();
});
