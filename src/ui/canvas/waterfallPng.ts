// The waterfall as a PNG in the look and scale of the catalog's pictures.
import type { Spectrogram } from "../../dsp/spectrogram.ts";
import { CATALOG_LOOK, paintWaterfall } from "./waterfallPaint.ts";

// The reference PNGs are 40 px per ms and at least 1500 px wide; a canvas cannot be much wider than this.
const PNG = { pxPerMs: 40, minWidth: 1500, maxWidth: 16000, height: 900 };

export function waterfallPng(data: Spectrogram, caption: string): Promise<Blob> {
  const durationMs = (data.length / data.sampleRate) * 1000;
  const target = document.createElement("canvas");
  target.width = Math.min(PNG.maxWidth, Math.max(PNG.minWidth, Math.round(durationMs * PNG.pxPerMs)));
  target.height = PNG.height;
  paintWaterfall(target, data, 0, data.length, CATALOG_LOOK, caption);
  return new Promise((resolve, reject) => target.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("the picture could not be made")))));
}
