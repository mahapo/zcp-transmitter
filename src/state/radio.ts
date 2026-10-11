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

  /** Whether the user has the receive monitor switched on; `rx` is what the receiver is doing. */
  rxWanted: false,
  rx: "off" as "off" | "starting" | "on" | "stopping",
  rxGain: 20,
  /** What the receiver hears, in dB relative to its full scale; null while it is off. */
  rxLevel: null as { rmsDb: number; noiseDb: number; peakDb: number | null; snrDb: number | null; clipped: boolean; pulseRate: number; duty: number } | null,
  /** Sent pulses held against received ones, while both directions run. */
  loopback: null as { sent: number; matched: number; missing: number; extra: number; lagMs: number } | null,
});
