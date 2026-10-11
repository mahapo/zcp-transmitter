// Save to Disk: collects pulses and writes them as the catalog's kind of IQ file.
import { AUDIO_RATE, CATALOG_RATE, catalogLabel } from "../dsp/config.ts";
import { IqHolder, outputLength } from "../dsp/resample.ts";
import { download, fileStamp } from "../lib/download.ts";
import { radio } from "../state/radio.ts";
import { session } from "../state/session.ts";
import { text } from "../text.ts";
import { say } from "./status.ts";
import { showRecording } from "./take.ts";

const MAX_RECORD_SECONDS = 30; // 16 MB per second

let recorded: Float32Array[] = [];

/** Adds freshly made pulses to a running recording. */
export function capture(pulses: Float32Array) {
  if (!radio.recording) return;
  recorded.push(pulses);
  radio.recordedSeconds += pulses.length / AUDIO_RATE;
  if (radio.recordedSeconds >= MAX_RECORD_SECONDS) stopRecording();
}

export function startRecording() {
  recorded = [];
  radio.recordedSeconds = 0;
  radio.recording = true;
  say(text.status.recording);
}

/** Saves what was recorded as complex64 IQ at 2 MS/s (I = pulses, Q = 0), the format of the catalog. */
export function stopRecording() {
  if (!radio.recording) return;
  radio.recording = false;
  const length = recorded.reduce((sum, part) => sum + part.length, 0);
  if (length === 0) return say(text.status.nothingRecorded);
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
  const name = `zcp_${catalogLabel(session.config.filters)}_${fileStamp()}.iq`;
  download(new Blob(parts, { type: "application/octet-stream" }), name);
  void showRecording(pulses, name);
  say(text.status.saved(name, length / AUDIO_RATE));
}
