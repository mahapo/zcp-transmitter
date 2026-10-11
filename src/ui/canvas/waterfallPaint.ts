// Draws the pulse waterfall: spectrogram on top, |IQ| below, as the catalog's
// generate_waterfall() lays it out.
import { FFT_SIZE, INFERNO, type Spectrogram } from "../../dsp/spectrogram.ts";

const ENVELOPE_SHARE = 0.25;

/** The colours and the font of everything that is not the spectrogram itself, which is always inferno. */
export interface WaterfallLook {
  strip: string;
  bar: string;
  axis: string;
  onImage: string;
  font: string;
}

/** The look of the catalog's PNGs. */
export const CATALOG_LOOK: WaterfallLook = {
  strip: "#fff",
  bar: "#2a6ebb",
  axis: "#444",
  onImage: "#fff",
  font: "ui-monospace, Menlo, monospace",
};

/** Paints analysed samples `from`..`to` of `data` across the whole of `target`. */
export function paintWaterfall(target: HTMLCanvasElement, data: Spectrogram, from: number, to: number, look: WaterfallLook, caption?: string) {
  const { width, height } = target;
  const context = target.getContext("2d")!;
  const envelopeHeight = Math.round(height * ENVELOPE_SHARE);
  const imageHeight = height - envelopeHeight;
  const perPixel = (to - from) / width;
  const range = data.maxDb - data.minDb || 1;

  // One column per pixel: per bin the strongest frame in the pixel's time span, highest frequency on top.
  const image = new ImageData(width, FFT_SIZE);
  const pulsed = new Uint8Array(width);
  for (let x = 0; x < width; x++) {
    const first = from + x * perPixel;
    const firstFrame = Math.min(data.frames - 1, Math.floor(first / data.hop));
    const endFrame = Math.min(data.frames, Math.max(firstFrame + 1, Math.ceil((first + perPixel) / data.hop)));
    for (let bin = 0; bin < FFT_SIZE; bin++) {
      let db = data.minDb;
      for (let frame = firstFrame; frame < endFrame; frame++) db = Math.max(db, data.db[frame * FFT_SIZE + bin]);
      const color = 3 * Math.round(((db - data.minDb) / range) * 255);
      const at = 4 * ((FFT_SIZE - 1 - bin) * width + x);
      image.data.set([INFERNO[color], INFERNO[color + 1], INFERNO[color + 2], 255], at);
    }
    const end = Math.max(Math.floor(first) + 1, Math.ceil(first + perPixel));
    for (let n = Math.floor(first); n < end && !pulsed[x]; n++) if (data.envelope(n) > 0) pulsed[x] = 1;
  }
  const strip = new OffscreenCanvas(width, FFT_SIZE);
  strip.getContext("2d")!.putImageData(image, 0, 0);
  context.imageSmoothingEnabled = false;
  context.drawImage(strip, 0, 0, width, imageHeight);

  // |IQ|: a bar wherever a pulse is on.
  context.fillStyle = look.strip;
  context.fillRect(0, imageHeight, width, envelopeHeight);
  context.fillStyle = look.bar;
  const barTop = imageHeight + Math.round(envelopeHeight * 0.2);
  const baseline = height - Math.round(envelopeHeight * 0.3);
  for (let x = 0; x < width; x++) if (pulsed[x]) context.fillRect(x, barTop, 1, baseline - barTop);
  context.fillRect(0, baseline, width, 1);

  // Labels: frequency offset on the left, time along the bottom.
  const font = Math.max(10, Math.round(height / 26));
  const label = (text: string, x: number, y: number, color: string, align: CanvasTextAlign = "left") => {
    context.font = `${font}px ${look.font}`;
    context.textAlign = align;
    context.fillStyle = color;
    context.fillText(text, x, y);
  };
  const halfMhz = (data.sampleRate / 2e6).toFixed(1);
  label(`+${halfMhz} MHz`, 4, font + 2, look.onImage);
  label("0", 4, imageHeight / 2 + font / 3, look.onImage);
  label(`-${halfMhz} MHz`, 4, imageHeight - 5, look.onImage);
  label("|IQ|", 4, barTop - 3, look.axis);
  if (caption) label(caption, width - 6, font + 2, look.onImage, "right");

  const msPerPixel = (perPixel / data.sampleRate) * 1000;
  const step = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].find((ms) => ms / msPerPixel >= font * 6) ?? 1000;
  const startMs = ((data.start + from) / data.sampleRate) * 1000;
  for (let ms = Math.ceil(startMs / step) * step; ms < startMs + width * msPerPixel; ms += step) {
    const x = (ms - startMs) / msPerPixel;
    context.fillStyle = look.axis;
    context.fillRect(x, baseline, 1, 4);
    label(`${+ms.toFixed(1)} ms`, x + 3, height - 4, look.axis);
  }
}

/** The share of a painted waterfall's height that is spectrogram. */
export const IMAGE_SHARE = 1 - ENVELOPE_SHARE;
