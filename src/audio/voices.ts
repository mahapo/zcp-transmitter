// What eSpeak can be asked for. Kept apart from tts.ts so that it can be used without loading the engine.

export const MAX_TEXT_LENGTH = 140;

/** A few of eSpeak's voices; any name `espeak-ng --voices` lists works. */
export const VOICES = [
  { id: "en-us", label: "English (US)" },
  { id: "en-gb", label: "English (UK)" },
  { id: "de", label: "Deutsch" },
  { id: "fr", label: "Français" },
  { id: "it", label: "Italiano" },
  { id: "es", label: "Español" },
];
