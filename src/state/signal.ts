// What the signal is doing right now: levels, counts and what the waterfall shows.
import { reactive } from "vue";
import type { Spectrogram } from "../dsp/spectrogram.ts";

export const signal = reactive({
  micOn: false,
  micDb: -60,
  generating: false,

  dutyLive: 0,
  dutyPeak: 0,
  pulses: 0,

  spectrogram: null as { title: string; data: Spectrogram } | null,
});
