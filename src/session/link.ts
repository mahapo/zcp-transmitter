// A link that carries the whole set-up: filters, sliders, frequency and what to
// say. It never carries the transmit level, and opening it starts nothing.
import { MAX_TEXT_LENGTH, VOICES } from "../audio/voices.ts";
import { type ChainConfig, catalogLabel, filtersFromLabel, normalizeConfig } from "../dsp/config.ts";

const VERSION = "1";
const MAX_FREQUENCY_HZ = 6e9; // more than any supported SDR tunes

export interface LinkState {
  config: ChainConfig;
  frequencyHz?: number;
  source?: "mic" | "tts";
  voice?: string;
  text?: string;
}

/** The fragment for `state`, without the "#". Filters go by their catalog names, joined by dots since "+" means a space in a query. */
export function encodeLink({ config, frequencyHz, source, voice, text }: LinkState): string {
  const fields = new URLSearchParams({
    z: VERSION,
    c: catalogLabel(config.filters).replaceAll("+", "."),
    p: String(config.pulseUs),
    h: String(config.hpfHz),
    l: String(config.lpfHz),
  });
  if (frequencyHz !== undefined) fields.set("f", String(Math.round(frequencyHz)));
  if (source) fields.set("s", source);
  if (voice) fields.set("v", voice);
  if (text) fields.set("t", text);
  return fields.toString();
}

/**
 * What a fragment asks for, or undefined if it is not one of ours. Whatever it
 * says is made valid: unknown filters drop the filter part, the rules of
 * config.ts apply, sliders snap to their steps and the text is cut to length.
 */
export function decodeLink(fragment: string): LinkState | undefined {
  const fields = new URLSearchParams(fragment.replace(/^#/, ""));
  if (fields.get("z") !== VERSION) return undefined;
  const number = (key: string) => (fields.has(key) ? Number(fields.get(key)) : undefined);
  const state: LinkState = {
    config: normalizeConfig({
      filters: filtersFromLabel((fields.get("c") ?? "baseline").replaceAll(".", "+")),
      pulseUs: number("p"),
      hpfHz: number("h"),
      lpfHz: number("l"),
    }),
  };
  const frequency = number("f");
  if (frequency !== undefined && frequency >= 1 && frequency <= MAX_FREQUENCY_HZ) state.frequencyHz = Math.round(frequency);
  const source = fields.get("s");
  if (source === "mic" || source === "tts") state.source = source;
  const voice = fields.get("v");
  if (VOICES.some(({ id }) => id === voice)) state.voice = voice!;
  const text = fields.get("t");
  if (text) state.text = text.slice(0, MAX_TEXT_LENGTH);
  return state;
}
