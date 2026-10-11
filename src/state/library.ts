// What the user has kept: presets and the history of takes.
import { reactive } from "vue";
import type { TakeRecord } from "../session/history.ts";
import { type Preset, loadPresets } from "../session/presets.ts";

export const library = reactive({
  presets: loadPresets() as Preset[],
  takes: [] as TakeRecord[],
  /** False when the browser offers no storage for the history, e.g. in a private window. */
  historyAvailable: true,
});
