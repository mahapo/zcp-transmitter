// What the waterfall shows.
import { markRaw } from "vue";
import { type SpectrogramData, withEnvelope } from "../dsp/spectrogram.ts";
import { signal } from "../state/signal.ts";
import { renderDsp } from "./dspClient.ts";
import { fail } from "./status.ts";

let shown = 0;

/** Shows the waterfall of `pulses`. Pass `data` when it was computed along with them, null when they hold no pulse. */
export async function showSpectrogram(pulses: Float32Array, title: string, data?: SpectrogramData | null) {
  const turn = ++shown;
  try {
    if (data === undefined) data = (await renderDsp.call({ kind: "spectrogram", pulses })).spectrogram;
    // A waterfall that was asked for later has overtaken this one.
    if (turn === shown) signal.spectrogram = data ? { title, data: markRaw(withEnvelope(data, pulses)) } : null;
  } catch (error) {
    fail(error);
  }
}
