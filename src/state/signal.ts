// What the signal is doing right now: levels, counts and the take on screen.
import { reactive } from "vue";
import type { StageId } from "../dsp/chain.ts";
import type { ChainConfig } from "../dsp/config.ts";
import type { Spectrogram } from "../dsp/spectrogram.ts";
import type { Tap } from "../engine/protocol.ts";

/** One utterance or recording, with everything the inspector and the waterfall show of it. */
export interface Take {
  title: string;
  /** The 48 kHz input. A recording has none: it is pulses only. */
  audio?: Float32Array;
  /** The settings the pulses were made with. */
  config: ChainConfig;
  pulses: Float32Array;
  /** Zero crossings that triggered a pulse. */
  pulseCount: number;
  duty: number;
  /** The stages that are at hand. */
  taps: Map<StageId, Tap>;
  /** The gain the AGC applied to each of its samples. */
  agcGain?: Float32Array;
  /** The largest magnitude at each of STAGES, NaN where a filter is off. */
  peaks?: Float32Array;
  spectrogram: Spectrogram | null;
  /** Whether these very pulses went out. False for a preview of settings changed since. */
  sent: boolean;
}

export const signal = reactive({
  micOn: false,
  micDb: -60,
  generating: false,

  dutyLive: 0,
  dutyPeak: 0,
  pulses: 0,

  /** Always marked raw: its arrays are far too large to be made reactive. */
  take: null as Take | null,
  /** The stage the inspector looks at. */
  stage: "agc" as StageId,
  /** True while changed settings are being applied to the take. */
  previewing: false,

  /** Pulses that began within the last second of what went out. */
  pulseRate: 0,
  /** The gain of the microphone chain's AGC. */
  agcGain: 1,
  /** The level at each of STAGES while the microphone is live, NaN where a filter is off. */
  livePeaks: null as Float32Array | null,
});
