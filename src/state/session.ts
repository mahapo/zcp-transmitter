// What the user has set up: the part of the state that presets and links carry.
import { reactive } from "vue";
import { appDefaults } from "../dsp/config.ts";

export const session = reactive({
  config: appDefaults(),
  source: "tts" as "mic" | "tts",
  text: "Test",
  voice: "en-us",
});
