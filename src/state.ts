// Everything the panels show and edit.
import { reactive } from "vue";
import { appDefaults } from "./dsp/config.ts";
import type { Spectrogram } from "./dsp/spectrogram.ts";
import type { SdrCapabilities } from "./sdr/device.ts";

// The original app's two presets (Open160.py: FREQ_70CM, FREQ_23CM).
export const FREQUENCY_PRESETS = [
  { hz: 425e6, label: "425 MHz (70cm)" },
  { hz: 1300e6, label: "1300 MHz (23cm)" },
];

export const state = reactive({
  config: appDefaults(),

  // Audio Input
  source: "tts" as "mic" | "tts",
  micOn: false,
  micDb: -60,
  text: "Test",
  voice: "en-us",
  generating: false,

  // Signal Processing
  dutyLive: 0,
  dutyPeak: 0,
  pulses: 0,

  // Output
  sink: "disk" as "sdr" | "disk",
  device: null as { name: string; caps: SdrCapabilities } | null,
  connecting: false,
  frequencyHz: 1300e6,
  gain: 0,
  tx: "off" as "off" | "starting" | "on" | "stopping",
  recording: false,
  recordedSeconds: 0,
  makeSpectrogram: true,
  spectrogram: null as { title: string; data: Spectrogram } | null,

  /** The latest status or error, shown under the panels. */
  message: "",
  failed: false,
});
