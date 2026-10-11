// Audio Input: the microphone, eSpeak and audio files, each run through the chain.
import { decodeFile } from "../audio/file.ts";
import { type Mic, levelDb, startMic } from "../audio/mic.ts";
import { synthesize } from "../audio/tts.ts";
import { AUDIO_RATE } from "../dsp/config.ts";
import { signalAt } from "../dsp/stages.ts";
import { prepareUtterance } from "../dsp/wav.ts";
import { session } from "../state/session.ts";
import { signal } from "../state/signal.ts";
import { text } from "../text.ts";
import { liveDsp } from "./dspClient.ts";
import { feedLive, resetLive } from "./instruments.ts";
import { audioFromHistory, remember } from "./library.ts";
import { monitorLive } from "./monitor.ts";
import { emit, queue } from "./pulses.ts";
import { fail, say } from "./status.ts";
import { currentConfig, renderTake, showTake } from "./take.ts";

const MAX_BACKLOG_SECONDS = 2; // of microphone pulses waiting for the transmitter

/** Renders an utterance, shows it and sends its pulses out. */
async function play(audio: Float32Array, title: string) {
  const take = await renderTake(audio, title);
  take.sent = true;
  emit(take.pulses, take.pulseCount);
  showTake(take);
  void remember(take);
  say(text.status.played(title, audio.length / AUDIO_RATE, take.pulseCount, take.duty));
}

/** Plays a take from the history again, with the settings it was made with. */
export async function playFromHistory(id: number) {
  const recalled = await audioFromHistory(id);
  if (!recalled) return;
  try {
    await play(recalled.audio, recalled.title);
  } catch (error) {
    fail(error);
  }
}

export async function generateVoice() {
  const words = session.text.trim();
  if (!words || signal.generating) return;
  signal.generating = true;
  try {
    await play(prepareUtterance(await synthesize(words, session.voice)), text.title.utterance(words));
  } catch (error) {
    fail(error);
  } finally {
    signal.generating = false;
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
    await play(await decodeFile(await response.arrayBuffer()), text.title.referenceSample);
  } catch (error) {
    fail(error);
  }
}

let mic: Mic | undefined;

export async function toggleMic() {
  if (mic) {
    mic.stop();
    mic = undefined;
    signal.micOn = false;
    signal.micDb = -60;
    return;
  }
  try {
    resetLive();
    mic = await startMic(async (samples) => {
      signal.micDb = levelDb(samples);
      const backlogged = queue.length > MAX_BACKLOG_SECONDS * AUDIO_RATE;
      const input = samples.slice(); // the block itself moves to the worker
      const reply = await liveDsp.call({ kind: "live", audio: samples, config: currentConfig(), tap: signalAt(signal.stage, session.config.filters) }, [samples.buffer]);
      if (!signal.micOn) return;
      feedLive(input, reply);
      monitorLive(input, reply);
      if (!backlogged) emit(reply.pulses, reply.pulseCount);
    });
    signal.micOn = true;
  } catch (error) {
    fail(new Error(text.status.microphone(error instanceof Error ? error.message : String(error))));
  }
}
