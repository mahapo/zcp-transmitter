// Changing the chain's settings, with a word about what a change brought with it.
import { FILTERS, type FilterKey, appDefaults, canEnable, catalogBaseline, withFilter } from "../dsp/config.ts";
import { session } from "../state/session.ts";
import { text } from "../text.ts";
import { say } from "./status.ts";

const label = (key: FilterKey) => FILTERS.find((filter) => filter.key === key)!.label;

/** Switches one filter under the rules of config.ts and says so when another one had to go. */
export function setFilter(key: FilterKey, on: boolean) {
  const before = session.config.filters;
  if (on && !canEnable(before, key)) return say(text.chain.noiseBlocked);
  const after = withFilter(before, key, on);
  session.config.filters = after;
  const dropped = FILTERS.find((filter) => before[filter.key] && !after[filter.key] && filter.key !== key);
  if (dropped) say(text.chain.switchedOff(label(dropped.key), label(key)));
}

export function resetToDefaults() {
  session.config = appDefaults();
}

export function allFiltersOff() {
  session.config = catalogBaseline();
}
