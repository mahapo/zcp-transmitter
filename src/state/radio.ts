// The output side: the SDR, its settings and the recorder.
import { reactive } from "vue";
import type { SdrCapabilities } from "../sdr/device.ts";

// The original app's two presets (Open160.py: FREQ_70CM, FREQ_23CM).
export const FREQUENCY_PRESETS = [
  { hz: 425e6, label: "425 MHz (70cm)" },
  { hz: 1300e6, label: "1300 MHz (23cm)" },
];

export const radio = reactive({
  sink: "disk" as "sdr" | "disk",
  device: null as { name: string; caps: SdrCapabilities } | null,
  connecting: false,
  frequencyHz: 1300e6,
  gain: 0,
  tx: "off" as "off" | "starting" | "on" | "stopping",
  recording: false,
  recordedSeconds: 0,
});
