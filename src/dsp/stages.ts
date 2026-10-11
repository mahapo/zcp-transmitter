// Which stages of the chain run for a set of filters, see STAGES in chain.ts.
import { STAGES, type StageId } from "./chain.ts";
import { FILTERS, type FilterKey, type Filters } from "./config.ts";

const OPTIONAL = new Set<string>(FILTERS.map(({ key }) => key));

/** Whether a stage is one of the optional filters. */
export function isOptional(stage: StageId): stage is StageId & FilterKey {
  return OPTIONAL.has(stage);
}

/** Whether a stage runs with these filters; the fixed ones always do. */
export function runs(stage: StageId, filters: Filters): boolean {
  return !isOptional(stage) || filters[stage];
}

/** The stage whose output is the signal at `stage`: itself, or the last one before it that runs. */
export function signalAt(stage: StageId, filters: Filters): StageId {
  let index = STAGES.indexOf(stage);
  while (!runs(STAGES[index], filters)) index--;
  return STAGES[index];
}
