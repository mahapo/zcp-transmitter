// How the page presents itself: the status line and view settings.
import { reactive, watch } from "vue";
import { load, save } from "../lib/storage.ts";

const STORAGE_KEY = "zcp:ui:v1";

export type Theme = "dark" | "light";

/** How much of the microphone's signal the inspector can show, in ms. */
export const LIVE_WINDOWS_MS = [100, 500, 2000];

/** The zoom levels of the waterfall in px per ms; 0 fits everything. 40 is the scale of the catalog's images. */
export const WATERFALL_ZOOMS = [0, 2, 10, 40];

/** What survives a reload. */
const kept = load(STORAGE_KEY, {
  theme: (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") as Theme,
  dockHeight: 260,
  makeSpectrogram: true,
  chainView: "flow" as "flow" | "list",
  dockTab: "waterfall" as "waterfall" | "instruments",
  /** What the monitor plays: the input, the stage in view or the pulses. */
  monitorSource: "input" as "input" | "tap" | "pulses",
  monitorVolume: 0.5,
});

export interface Toast {
  id: number;
  message: string;
}

export const ui = reactive({
  /** The latest status or error. */
  message: "",
  failed: false,
  /** Errors, shown until dismissed or timed out. */
  toasts: [] as Toast[],
  shortcutsOpen: false,

  /** Waterfall zoom in px per ms; 0 fits everything. The steps are WATERFALL_ZOOMS. */
  waterfallZoom: 0,
  /** The stretch of the take the waterfall shows, in ms of pulse time. The inspector follows it. */
  span: null as { fromMs: number; toMs: number } | null,
  /** Where the pointer is on the time axis, shared by every view of the take. */
  cursorMs: null as number | null,
  liveWindowMs: 500,
  /** Where the monitor is playing, on the same time axis. */
  playheadMs: null as number | null,
  /** Whether the microphone's chain is played as it runs. Off at every start: a loudspeaker would feed back. */
  monitorLive: false,

  ...kept,
});

watch(
  () => ({ theme: ui.theme, dockHeight: ui.dockHeight, makeSpectrogram: ui.makeSpectrogram, chainView: ui.chainView, dockTab: ui.dockTab, monitorSource: ui.monitorSource, monitorVolume: ui.monitorVolume }),
  (settings) => save(STORAGE_KEY, settings),
);
