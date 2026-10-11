// The keyboard shortcuts. None of them starts the transmitter: going on air takes a deliberate click.
import { onBeforeUnmount, onMounted } from "vue";
import { STAGES } from "../dsp/chain.ts";
import { generateVoice } from "../engine/engine.ts";
import { signal } from "../state/signal.ts";
import { WATERFALL_ZOOMS, ui } from "../state/ui.ts";
import { text } from "../text.ts";

export interface Shortcut {
  /** As shown: "Mod" is Cmd on a Mac and Ctrl elsewhere. */
  keys: string[];
  /** The values of KeyboardEvent.key that trigger it. */
  match: string[];
  mod?: boolean;
  label: string;
  run(): void;
}

function stepStage(by: number) {
  const index = STAGES.indexOf(signal.stage) + by;
  if (index >= 0 && index < STAGES.length) signal.stage = STAGES[index];
}

function stepZoom(by: number) {
  const index = WATERFALL_ZOOMS.indexOf(ui.waterfallZoom) + by;
  if (index >= 0 && index < WATERFALL_ZOOMS.length) ui.waterfallZoom = WATERFALL_ZOOMS[index];
}

const t = text.shortcuts;

export const SHORTCUTS: Shortcut[] = [
  { keys: ["Mod", "Enter"], match: ["Enter"], mod: true, label: t.generate, run: () => void generateVoice() },
  { keys: ["["], match: ["["], label: t.previousTap, run: () => stepStage(-1) },
  { keys: ["]"], match: ["]"], label: t.nextTap, run: () => stepStage(1) },
  { keys: ["+"], match: ["+", "="], label: t.zoomIn, run: () => stepZoom(1) },
  { keys: ["−"], match: ["-"], label: t.zoomOut, run: () => stepZoom(-1) },
  { keys: ["0"], match: ["0"], label: t.zoomFit, run: () => (ui.waterfallZoom = 0) },
  { keys: ["P"], match: ["p", "P"], label: t.resetPeak, run: () => (signal.dutyPeak = 0) },
  { keys: ["?"], match: ["?"], label: t.show, run: () => (ui.shortcutsOpen = !ui.shortcutsOpen) },
];

/** Typing into a field must stay typing. */
function inField(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

function onKey(event: KeyboardEvent) {
  if (event.altKey || event.defaultPrevented) return;
  const mod = event.metaKey || event.ctrlKey;
  const shortcut = SHORTCUTS.find((each) => each.match.includes(event.key) && Boolean(each.mod) === mod);
  if (!shortcut || (!shortcut.mod && inField(event.target))) return;
  event.preventDefault();
  shortcut.run();
}

/** Listens for the shortcuts while the calling component is mounted. */
export function useShortcuts() {
  onMounted(() => addEventListener("keydown", onKey));
  onBeforeUnmount(() => removeEventListener("keydown", onKey));
}
