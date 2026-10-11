// The Catalog Lab: runs the catalog's configurations over one utterance, as
// generate_combinations.py does, and writes them out in the catalog's layout.
import { markRaw } from "vue";
import { decodeFile } from "../audio/file.ts";
import { type Reference, isReferenceAudio, loadReference } from "../catalog/reference.ts";
import { pulsesFromEdges } from "../dsp/analysis.ts";
import { AUDIO_RATE } from "../dsp/config.ts";
import { encodeWav } from "../dsp/wavWrite.ts";
import { download, fileStamp } from "../lib/download.ts";
import { type ZipEntry, zip } from "../lib/zip.ts";
import { catalogIq, catalogIqBytes } from "../session/iq.ts";
import { manifestCsv } from "../session/manifest.ts";
import { sigmfMeta } from "../session/sigmf.ts";
import { LAB_ENTRIES, type LabEntry, type LabResult, lab } from "../state/lab.ts";
import { signal } from "../state/signal.ts";
import { text } from "../text.ts";
import { DspClient } from "./dspClient.ts";
import { fail, say } from "./status.ts";

const THUMB_COLUMNS = 480;
const MAX_WORKERS = 4;

/** The audio the last batch ran over, kept for the export. */
let audio: Float32Array | undefined;
let workers: DspClient[] = [];
let run = 0;

async function referenceSample(): Promise<Float32Array> {
  const response = await fetch(`${import.meta.env.BASE_URL}samples/test-48k.wav`);
  return decodeFile(await response.arrayBuffer());
}

/** Runs every distinct configuration over the chosen utterance, a few at a time. */
export async function runLab() {
  if (lab.running) return;
  const turn = ++run;
  lab.running = true;
  lab.done = 0;
  lab.results = {};
  lab.picked = [];
  try {
    const useTake = lab.source === "take" && signal.take?.audio;
    const samples = useTake ? signal.take!.audio! : await referenceSample();
    audio = samples;
    lab.title = useTake ? signal.take!.title : text.title.referenceSample;
    lab.samples = samples.length;

    // The catalog can only be compared with when the utterance is the one it was made from.
    let reference: Reference | undefined;
    try {
      const loaded = await loadReference();
      if (await isReferenceAudio(samples, loaded)) reference = loaded;
    } catch {
      // Without the reference data the batch still runs, just without the comparison.
    }
    lab.isReference = reference !== undefined;

    const jobs = LAB_ENTRIES.filter((entry) => entry.sameAs === undefined);
    lab.total = jobs.length;
    // Leave two threads to the page and the microphone's chain.
    const count = Math.max(1, Math.min(MAX_WORKERS, (navigator.hardwareConcurrency || 4) - 2, jobs.length));
    workers = Array.from({ length: count }, () => new DspClient());
    let next = 0;
    await Promise.all(
      workers.map(async (worker) => {
        const copy = samples.slice();
        await worker.call({ kind: "labAudio", audio: copy }, [copy.buffer]);
        while (next < jobs.length && turn === run) {
          const entry = jobs[next++];
          const reply = await worker.call({
            kind: "lab",
            config: { ...entry.config, filters: { ...entry.config.filters } },
            columns: THUMB_COLUMNS,
            reference: reference?.entries.find((each) => each.path === entry.path),
          });
          if (turn !== run) return;
          const result: LabResult = { ...reply, crossings: reply.pulseCount, pulses: Math.ceil(reply.edges.length / 2) };
          lab.results[entry.path] = markRaw(result);
          lab.done++;
        }
      }),
    );
    if (turn === run) say(text.lab.finished(LAB_ENTRIES.length, lab.title));
  } catch (error) {
    if (turn === run) fail(error);
  } finally {
    if (turn === run) {
      for (const worker of workers) worker.terminate();
      workers = [];
      lab.running = false;
    }
  }
}

/** Stops a running batch. What is finished stays on screen. */
export function cancelLab() {
  if (!lab.running) return;
  run++;
  for (const worker of workers) worker.terminate();
  workers = [];
  lab.running = false;
  say(text.lab.cancelled(lab.done, lab.total));
}

/** The result of an entry, which for one that is the same as another is that one's. */
export function labResult(entry: LabEntry): LabResult | undefined {
  return lab.results[entry.sameAs ?? entry.path];
}

/** The pulse train of a result as the chain put it out, which is what an IQ file holds. */
function trainOf(result: LabResult): Float32Array {
  return pulsesFromEdges(result.edges, lab.samples - result.skipped, result.skipped);
}

/** The size of the IQ files of all finished entries, unpacked. */
export function labIqBytes(): number {
  return LAB_ENTRIES.reduce((sum, entry) => {
    const result = labResult(entry);
    return sum + (result ? catalogIqBytes(lab.samples - result.skipped) : 0);
  }, 0);
}

/** Writes everything that is finished as one archive in the catalog's layout. */
export async function exportLab() {
  if (!audio || lab.packing) return;
  const utterance = audio;
  const created = new Date();
  const finished = LAB_ENTRIES.flatMap((entry) => {
    const result = labResult(entry);
    return result ? [{ entry, result }] : [];
  });
  const encoder = new TextEncoder();
  const files: ZipEntry[] = finished.flatMap(({ entry, result }) => [
    { path: `${entry.path}.iq`, data: () => catalogIq(trainOf(result)) },
    {
      path: `${entry.path}.sigmf-meta`,
      data: [
        encoder.encode(
          sigmfMeta({ dataset: `${entry.name}.iq`, config: entry.config, title: lab.title, pulses: result.crossings, dutyCycle: result.duty, created }),
        ),
      ],
    },
  ]);
  const rows = finished.map(({ entry, result }) => ({
    subfolder: entry.folder,
    name: entry.name,
    config: entry.config,
    iqBytes: catalogIqBytes(lab.samples - result.skipped),
    png: false,
    status: "OK",
  }));
  files.push({ path: "_tts/tts_48k.wav", data: [encodeWav(utterance, AUDIO_RATE)] }, { path: "manifest.csv", data: [encoder.encode(manifestCsv(rows))] });

  lab.packing = { done: 0, total: files.length };
  try {
    const archive = await zip(files, created, (packed) => (lab.packing = { done: packed, total: files.length }));
    const name = `zcp_catalog_${fileStamp()}.zip`;
    download(archive, name);
    say(text.exporting.done(name, archive.size / 1e6));
  } catch (error) {
    fail(error);
  } finally {
    lab.packing = null;
  }
}
