// Named settings of the chain, kept in the browser.
import { type ChainConfig, normalizeConfig } from "../dsp/config.ts";

const STORAGE_KEY = "zcp:presets:v1";

export interface Preset {
  name: string;
  config: ChainConfig;
}

/** The stored presets by name. Whatever is in storage is made valid, since anyone can edit it. */
export function loadPresets(): Preset[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(stored)) return [];
    return stored
      .filter((each): each is { name: string; config: object } => typeof each?.name === "string" && each.name !== "" && typeof each.config === "object" && each.config !== null)
      .map(({ name, config }) => ({ name, config: normalizeConfig(config) }));
  } catch {
    return [];
  }
}

function store(presets: Preset[]): Preset[] {
  const sorted = [...presets].sort((a, b) => a.name.localeCompare(b.name));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sorted));
  } catch {
    // Without storage the presets last until the page is closed.
  }
  return sorted;
}

/** Adds a preset, replacing one of the same name, and returns the new list. */
export function savePreset(presets: Preset[], name: string, config: ChainConfig): Preset[] {
  const copy: ChainConfig = { ...config, filters: { ...config.filters } };
  return store([...presets.filter((preset) => preset.name !== name), { name, config: copy }]);
}

export function removePreset(presets: Preset[], name: string): Preset[] {
  return store(presets.filter((preset) => preset.name !== name));
}
