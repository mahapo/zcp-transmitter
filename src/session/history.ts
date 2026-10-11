// The history: what was played, kept in the browser so it can be opened again.
// Only the input audio and the settings are stored; pulses and pictures are
// made anew from them, exactly as the first time.
import type { ChainConfig } from "../dsp/config.ts";
import { openDatabase, request, transact } from "../lib/idb.ts";

const DATABASE = "zcp";
const TAKES = "takes";
const AUDIO = "audio";
export const MAX_TAKES = 50;
export const MAX_BYTES = 200e6;

export interface TakeRecord {
  id: number;
  title: string;
  created: number;
  config: ChainConfig;
  seconds: number;
  pulses: number;
  duty: number;
  /** Size of the stored audio. */
  bytes: number;
  /** Pinned takes are never dropped to make room. */
  pinned: boolean;
}

let opened: Promise<IDBDatabase> | undefined;
const database = () => (opened ??= openDatabase(DATABASE, 1, { [TAKES]: { keyPath: "id" }, [AUDIO]: {} }));

/** Every take, the newest first. */
export async function listTakes(): Promise<TakeRecord[]> {
  const takes = await transact(await database(), [TAKES], "readonly", ([takes]) => request<TakeRecord[]>(takes.getAll()));
  return takes.sort((a, b) => b.created - a.created);
}

/**
 * Stores a take with its audio (float32, as the chain got it, so playing it
 * again gives the same pulses) and drops the oldest unpinned ones beyond
 * MAX_TAKES or MAX_BYTES. Resolves with the list as it is afterwards.
 */
export async function addTake(take: Omit<TakeRecord, "id" | "bytes" | "pinned">, audio: Float32Array): Promise<TakeRecord[]> {
  const samples = audio.slice();
  await transact(await database(), [TAKES, AUDIO], "readwrite", async ([takes, audios]) => {
    const id = (await request(takes.add({ ...take, bytes: samples.byteLength, pinned: false }))) as number;
    audios.put(samples, id);
    const all = (await request<TakeRecord[]>(takes.getAll())).sort((a, b) => b.created - a.created);
    let count = 0;
    let bytes = 0;
    for (const each of all) {
      count++;
      bytes += each.bytes;
      // The newest take always stays, whatever its size.
      if (each.pinned || each.id === id || (count <= MAX_TAKES && bytes <= MAX_BYTES)) continue;
      takes.delete(each.id);
      audios.delete(each.id);
      count--;
      bytes -= each.bytes;
    }
  });
  return listTakes();
}

export async function loadAudio(id: number): Promise<Float32Array | undefined> {
  return transact(await database(), [AUDIO], "readonly", ([audios]) => request<Float32Array | undefined>(audios.get(id)));
}

export async function removeTake(id: number): Promise<void> {
  await transact(await database(), [TAKES, AUDIO], "readwrite", ([takes, audios]) => {
    takes.delete(id);
    audios.delete(id);
  });
}

export async function setPinned(id: number, pinned: boolean): Promise<void> {
  await transact(await database(), [TAKES], "readwrite", async ([takes]) => {
    const take = await request<TakeRecord | undefined>(takes.get(id));
    if (take) takes.put({ ...take, pinned });
  });
}

/** Removes every take that is not pinned. */
export async function clearTakes(): Promise<void> {
  await transact(await database(), [TAKES, AUDIO], "readwrite", async ([takes, audios]) => {
    for (const take of await request<TakeRecord[]>(takes.getAll())) {
      if (take.pinned) continue;
      takes.delete(take.id);
      audios.delete(take.id);
    }
  });
}
