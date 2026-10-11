// Draws the live instruments: the rolling waterfall, the histogram of pulse spacing and the duty history.
import { FFT_SIZE, INFERNO } from "../../dsp/spectrogram.ts";
import { token } from "./theme.ts";

const FONT_PX = 10;
const AXIS_PX = 16;

function font(context: CanvasRenderingContext2D) {
  context.font = `${FONT_PX}px ${token("--font-mono")}`;
  context.textBaseline = "alphabetic";
}

/**
 * Paints the latest columns of a ring of waterfall columns (FFT_SIZE levels
 * each, 0..255), newest at the right edge, one column per CSS pixel.
 */
export function paintRolling(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  ring: { columns: Uint8Array; count: number; capacity: number; columnSeconds: number },
) {
  const plotHeight = height - AXIS_PX;
  const shown = Math.min(Math.ceil(width), ring.capacity);
  const image = new ImageData(shown, FFT_SIZE);
  image.data.fill(255); // opaque; every pixel is set below or stays black
  for (let x = 0; x < shown; x++) {
    const column = ring.count - shown + x;
    for (let bin = 0; bin < FFT_SIZE; bin++) {
      const level = column < 0 ? 0 : ring.columns[(column % ring.capacity) * FFT_SIZE + bin];
      const at = 4 * ((FFT_SIZE - 1 - bin) * shown + x);
      image.data[at] = INFERNO[3 * level];
      image.data[at + 1] = INFERNO[3 * level + 1];
      image.data[at + 2] = INFERNO[3 * level + 2];
    }
  }
  const strip = new OffscreenCanvas(shown, FFT_SIZE);
  strip.getContext("2d")!.putImageData(image, 0, 0);
  context.imageSmoothingEnabled = false;
  context.drawImage(strip, width - shown, 0, shown, plotHeight);

  font(context);
  context.fillStyle = token("--plot-bg");
  context.fillRect(0, plotHeight, width, AXIS_PX);
  context.fillStyle = token("--text-faint");
  // A label every second, counted back from now.
  const pxPerSecond = 1 / ring.columnSeconds;
  context.textAlign = "right";
  for (let seconds = 0; seconds * pxPerSecond < width - 20; seconds++) {
    const x = width - seconds * pxPerSecond;
    context.fillRect(Math.round(x) - 1, plotHeight, 1, 3);
    context.fillText(seconds === 0 ? "now" : `-${seconds} s`, x - 3, height - 4);
  }
  context.textAlign = "left";
  context.fillStyle = "#fff";
  context.fillText("+1.0 MHz", 4, FONT_PX + 2);
  context.fillText("-1.0 MHz", 4, plotHeight - 4);
}

/**
 * Paints how often each spacing between pulses occurred, on a logarithmic axis
 * from `minMs` to `maxMs`. `gaps` are spacings in milliseconds.
 */
export function paintHistogram(context: CanvasRenderingContext2D, width: number, height: number, gapsMs: Float32Array, minMs = 0.1, maxMs = 100) {
  const plotHeight = height - AXIS_PX;
  context.fillStyle = token("--plot-bg");
  context.fillRect(0, 0, width, height);
  font(context);

  const bins = Math.max(8, Math.floor(width / 6));
  const counts = new Uint32Array(bins);
  const span = Math.log(maxMs / minMs);
  let most = 0;
  for (const gap of gapsMs) {
    if (!(gap > 0)) continue;
    const bin = Math.max(0, Math.min(bins - 1, Math.floor((Math.log(gap / minMs) / span) * bins)));
    most = Math.max(most, ++counts[bin]);
  }

  const grid = token("--plot-grid");
  const faint = token("--text-faint");
  for (const ms of [0.1, 1, 10, 100]) {
    if (ms < minMs || ms > maxMs) continue;
    const x = Math.round((Math.log(ms / minMs) / span) * width);
    context.fillStyle = grid;
    context.fillRect(Math.min(width - 1, x), 0, 1, plotHeight);
    context.fillStyle = faint;
    context.textAlign = x > width - 40 ? "right" : "left";
    context.fillText(`${ms} ms`, x + (x > width - 40 ? -3 : 3), height - 4);
  }
  context.fillStyle = token("--trace-pulse");
  const barWidth = width / bins;
  for (let bin = 0; bin < bins; bin++) {
    if (counts[bin] === 0) continue;
    const barHeight = Math.max(1, (counts[bin] / most) * (plotHeight - 4));
    context.fillRect(bin * barWidth + 0.5, plotHeight - barHeight, Math.max(1, barWidth - 1), barHeight);
  }
}

/** Paints a history of values between 0 and `fullScale` as a filled line, the latest at the right edge. */
export function paintHistory(context: CanvasRenderingContext2D, width: number, height: number, values: Float32Array, fullScale: number, color: string) {
  context.fillStyle = token("--plot-bg");
  context.fillRect(0, 0, width, height);
  const grid = token("--plot-grid");
  context.fillStyle = grid;
  for (const share of [0.5, 1]) context.fillRect(0, Math.round(height - 1 - share * (height - 2)), width, 1);

  const step = width / Math.max(1, values.length - 1);
  const y = (value: number) => height - 1 - Math.min(1, value / fullScale) * (height - 2);
  context.beginPath();
  context.moveTo(0, height);
  values.forEach((value, n) => context.lineTo(n * step, y(value)));
  context.lineTo(width, height);
  context.closePath();
  context.globalAlpha = 0.2;
  context.fillStyle = color;
  context.fill();
  context.globalAlpha = 1;
  context.beginPath();
  values.forEach((value, n) => (n === 0 ? context.moveTo(0, y(value)) : context.lineTo(n * step, y(value))));
  context.strokeStyle = color;
  context.lineWidth = 1.25;
  context.stroke();
}
