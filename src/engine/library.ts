// Presets, links and the history of takes.
import { AUDIO_RATE, type ChainConfig, catalogLabel } from "../dsp/config.ts";
import { addTake, clearTakes, listTakes, loadAudio, removeTake, setPinned } from "../session/history.ts";
import { decodeLink, encodeLink } from "../session/link.ts";
import { removePreset, savePreset } from "../session/presets.ts";
import { library } from "../state/library.ts";
import { radio } from "../state/radio.ts";
import { session } from "../state/session.ts";
import type { Take } from "../state/signal.ts";
import { text } from "../text.ts";
import { fail, say } from "./status.ts";
import { currentConfig, renderTake, showTake } from "./take.ts";

// --- presets ------------------------------------------------------------------

export function applyConfig(config: ChainConfig) {
  session.config = { ...config, filters: { ...config.filters } };
}

export function saveCurrentAs(name: string) {
  library.presets = savePreset(library.presets, name.trim(), currentConfig());
  say(text.presets.saved(name.trim()));
}

export function deletePreset(name: string) {
  library.presets = removePreset(library.presets, name);
}

// --- links --------------------------------------------------------------------

/** The address of this page with the current set-up in its fragment. */
export function currentLink(): string {
  const fragment = encodeLink({ config: currentConfig(), frequencyHz: radio.frequencyHz, source: session.source, voice: session.voice, text: session.text });
  return `${location.origin}${location.pathname}#${fragment}`;
}

/** Copies the link, or failing that puts it into the address bar. */
export async function copyLink() {
  const link = currentLink();
  try {
    await navigator.clipboard.writeText(link);
    say(text.presets.linkCopied);
  } catch {
    history.replaceState(null, "", link);
    say(text.presets.linkInAddressBar);
  }
}

/** Takes over the set-up a link carries, once, when the page opens. Nothing is played or sent. */
export function applyLinkFromAddress() {
  const state = decodeLink(location.hash);
  if (!state) return;
  applyConfig(state.config);
  if (state.frequencyHz !== undefined) radio.frequencyHz = state.frequencyHz;
  if (state.source) session.source = state.source;
  if (state.voice) session.voice = state.voice;
  if (state.text !== undefined) session.text = state.text;
  history.replaceState(null, "", location.pathname + location.search);
  say(text.presets.linkApplied);
}

// --- history ------------------------------------------------------------------

/** Reads the history when the page opens. Without storage the app works on, just without one. */
export async function openHistory() {
  try {
    library.takes = await listTakes();
  } catch {
    library.historyAvailable = false;
  }
}

/** Keeps a take that was just played. Playing the same thing again does not add it twice. */
export async function remember(take: Take) {
  if (!take.audio || !library.historyAvailable) return;
  const seconds = take.audio.length / AUDIO_RATE;
  const [latest] = library.takes;
  if (latest && latest.title === take.title && latest.seconds === seconds && JSON.stringify(latest.config) === JSON.stringify(take.config)) return;
  try {
    library.takes = await addTake({ title: take.title, created: Date.now(), config: take.config, seconds, pulses: take.pulseCount, duty: take.duty }, take.audio);
  } catch {
    library.historyAvailable = false;
  }
}

/** The audio of a stored take, with its settings made the current ones. */
async function recall(id: number): Promise<{ audio: Float32Array; title: string } | undefined> {
  const record = library.takes.find((take) => take.id === id);
  const audio = record && (await loadAudio(id));
  if (!record || !audio) return undefined;
  applyConfig(record.config);
  return { audio, title: record.title };
}

/** Shows a stored take with the settings it was made with. Nothing is sent. */
export async function openFromHistory(id: number) {
  try {
    const recalled = await recall(id);
    if (!recalled) return;
    showTake(await renderTake(recalled.audio, recalled.title));
    say(text.history.opened(recalled.title, catalogLabel(session.config.filters)));
  } catch (error) {
    fail(error);
  }
}

/** The audio of a stored take for playing it out again, with its settings made the current ones. */
export async function audioFromHistory(id: number): Promise<{ audio: Float32Array; title: string } | undefined> {
  try {
    return await recall(id);
  } catch (error) {
    fail(error);
    return undefined;
  }
}

export async function forget(id: number) {
  await removeTake(id).catch(fail);
  library.takes = library.takes.filter((take) => take.id !== id);
}

export async function pin(id: number, pinned: boolean) {
  await setPinned(id, pinned).catch(fail);
  const take = library.takes.find((each) => each.id === id);
  if (take) take.pinned = pinned;
}

export async function clearHistory() {
  await clearTakes().catch(fail);
  library.takes = library.takes.filter((take) => take.pinned);
}
