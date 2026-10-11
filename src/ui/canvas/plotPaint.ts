// Draws the inspector's plots: a waveform over time and a spectrum over frequency.
import { token } from "./theme.ts";

const TICK_STEPS_MS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
const FONT_PX = 10;
const AXIS_PX = 16; // room for the labels along the bottom

function frame(context: CanvasRenderingContext2D, width: number, height: number) {
  context.fillStyle = token("--plot-bg");
  context.fillRect(0, 0, width, height);
  context.font = `${FONT_PX}px ${token("--font-mono")}`;
  context.textBaseline = "alphabetic";
}

export interface ScopeTrace {
  /** The signal, and the time index of its first sample. */
  samples: Float32Array;
  offset: number;
  /** The value at the top of the plot; the bottom is its negative, or 0 when `unipolar`. */
  scale: number;
  unipolar?: boolean;
  color: string;
}

export interface ScopeView {
  /** The stretch of the time axis in view, in samples, and the rate that turns them into time. */
  from: number;
  to: number;
  sampleRate: number;
  traces: ScopeTrace[];
  /** Marks along the bottom wherever it is above zero, on the same time axis. */
  pulses?: { samples: Float32Array; offset: number };
  cursor?: number | null;
  /** Where playback is, on the same axis. */
  playhead?: number | null;
  note?: string;
}

/** Paints signals over time: per pixel the range the signal covers, or a line when zoomed in far enough. */
export function paintScope(context: CanvasRenderingContext2D, width: number, height: number, view: ScopeView) {
  frame(context, width, height);
  const pulseHeight = view.pulses ? 12 : 0;
  const plotHeight = height - AXIS_PX - pulseHeight;
  const perPixel = (view.to - view.from) / width;
  const grid = token("--plot-grid");
  const faint = token("--text-faint");

  // Time grid and its labels.
  const msPerPixel = (perPixel / view.sampleRate) * 1000;
  const step = TICK_STEPS_MS.find((ms) => ms / msPerPixel >= 70) ?? 10000;
  const startMs = (view.from / view.sampleRate) * 1000;
  context.textAlign = "left";
  for (let ms = Math.ceil(startMs / step) * step; ms < startMs + width * msPerPixel; ms += step) {
    const x = Math.round((ms - startMs) / msPerPixel);
    context.fillStyle = grid;
    context.fillRect(x, 0, 1, height - AXIS_PX);
    context.fillStyle = faint;
    context.fillText(`${+ms.toFixed(1)} ms`, x + 3, height - 4);
  }

  for (const trace of view.traces) {
    const { samples, offset, scale, unipolar, color } = trace;
    const y = (value: number) => (unipolar ? plotHeight - 1 - (value / scale) * (plotHeight - 2) : plotHeight / 2 - (value / scale) * (plotHeight / 2 - 1));
    if (!unipolar) {
      context.fillStyle = grid;
      context.fillRect(0, Math.round(plotHeight / 2), width, 1);
    }
    context.fillStyle = context.strokeStyle = color;
    if (perPixel < 0.5) {
      // Fewer than one sample per two pixels: join the samples.
      context.beginPath();
      const first = Math.max(0, Math.floor(view.from - offset));
      const last = Math.min(samples.length - 1, Math.ceil(view.to - offset));
      for (let n = first; n <= last; n++) {
        const x = (n + offset - view.from) / perPixel;
        if (n === first) context.moveTo(x, y(samples[n]));
        else context.lineTo(x, y(samples[n]));
      }
      context.lineWidth = 1.25;
      context.stroke();
      continue;
    }
    for (let x = 0; x < width; x++) {
      const first = Math.floor(view.from + x * perPixel - offset);
      const end = Math.min(samples.length, Math.max(first + 1, Math.ceil(view.from + (x + 1) * perPixel - offset)));
      if (end <= 0 || first >= samples.length) continue;
      let low = Infinity;
      let high = -Infinity;
      for (let n = Math.max(0, first); n < end; n++) {
        const value = samples[n];
        if (value < low) low = value;
        if (value > high) high = value;
      }
      const top = Math.max(0, Math.min(plotHeight, y(high)));
      const bottom = Math.max(0, Math.min(plotHeight, y(low)));
      context.fillRect(x, top, 1, Math.max(1, bottom - top));
    }
  }

  if (view.pulses) {
    const { samples, offset } = view.pulses;
    const top = plotHeight + 2;
    context.fillStyle = grid;
    context.fillRect(0, plotHeight, width, 1);
    context.fillStyle = token("--trace-pulse");
    for (let x = 0; x < width; x++) {
      const first = Math.floor(view.from + x * perPixel - offset);
      const end = Math.min(samples.length, Math.max(first + 1, Math.ceil(view.from + (x + 1) * perPixel - offset)));
      for (let n = Math.max(0, first); n < end; n++) {
        if (samples[n] > 0) {
          context.fillRect(x, top, 1, pulseHeight - 3);
          break;
        }
      }
    }
  }

  if (view.note) {
    context.textAlign = "right";
    context.fillStyle = faint;
    context.fillText(view.note, width - 6, FONT_PX + 4);
  }
  const line = (at: number | null | undefined, color: string, thickness: number) => {
    if (at === null || at === undefined || at < view.from || at > view.to) return;
    context.fillStyle = color;
    context.fillRect(Math.round((at - view.from) / perPixel) - (thickness - 1) / 2, 0, thickness, height - AXIS_PX);
  };
  line(view.cursor, token("--text-muted"), 1);
  line(view.playhead, token("--accent"), 2);
}

export interface SpectrumView {
  /** Level in dB per bin; bin k is at k · binHz. */
  db: Float32Array;
  binHz: number;
  color: string;
  /** Frequencies to mark, e.g. the filter cut-offs. */
  marks?: { hz: number; label: string }[];
  format(hz: number): string;
}

const SPECTRUM_MIN_HZ = 40;
const SPECTRUM_RANGE_DB = 90;
const SPECTRUM_TICKS_HZ = [100, 1000, 10000];

/** Paints a spectrum on a logarithmic frequency axis, from 40 Hz up to half the sample rate. */
export function paintSpectrum(context: CanvasRenderingContext2D, width: number, height: number, view: SpectrumView) {
  frame(context, width, height);
  const plotHeight = height - AXIS_PX;
  const maxHz = (view.db.length - 1) * view.binHz;
  const span = Math.log(maxHz / SPECTRUM_MIN_HZ);
  const x = (hz: number) => (Math.log(hz / SPECTRUM_MIN_HZ) / span) * width;
  const grid = token("--plot-grid");
  const faint = token("--text-faint");

  let top = -Infinity;
  for (const value of view.db) top = Math.max(top, value);
  top = Math.ceil((top + 3) / 10) * 10; // headroom, on a round number
  const y = (db: number) => ((top - db) / SPECTRUM_RANGE_DB) * plotHeight;

  context.textAlign = "left";
  for (let db = top; db > top - SPECTRUM_RANGE_DB; db -= 20) {
    context.fillStyle = grid;
    context.fillRect(0, Math.round(y(db)), width, 1);
    context.fillStyle = faint;
    if (db < top) context.fillText(`${db} dB`, 4, y(db) - 3);
  }
  for (const hz of SPECTRUM_TICKS_HZ) {
    context.fillStyle = grid;
    context.fillRect(Math.round(x(hz)), 0, 1, plotHeight);
    context.fillStyle = faint;
    context.fillText(view.format(hz), x(hz) + 3, height - 4);
  }

  // The strongest bin under each pixel, so narrow peaks survive at the dense end of the axis.
  context.beginPath();
  context.moveTo(0, plotHeight);
  for (let column = 0; column <= width; column++) {
    const fromHz = SPECTRUM_MIN_HZ * Math.exp((column / width) * span);
    const toHz = SPECTRUM_MIN_HZ * Math.exp(((column + 1) / width) * span);
    const first = Math.min(view.db.length - 1, Math.round(fromHz / view.binHz));
    const last = Math.min(view.db.length - 1, Math.max(first, Math.round(toHz / view.binHz)));
    let level = -Infinity;
    for (let bin = first; bin <= last; bin++) level = Math.max(level, view.db[bin]);
    context.lineTo(column, Math.min(plotHeight, y(level)));
  }
  context.lineTo(width, plotHeight);
  context.closePath();
  context.globalAlpha = 0.18;
  context.fillStyle = view.color;
  context.fill();
  context.globalAlpha = 1;
  context.strokeStyle = view.color;
  context.lineWidth = 1.25;
  context.stroke();
  context.fillStyle = token("--plot-bg");
  context.fillRect(0, plotHeight, width, AXIS_PX); // the stroke of the closing edge

  context.fillStyle = faint;
  for (const hz of SPECTRUM_TICKS_HZ) context.fillText(view.format(hz), x(hz) + 3, height - 4);
  for (const mark of view.marks ?? []) {
    if (mark.hz <= SPECTRUM_MIN_HZ || mark.hz >= maxHz) continue;
    const at = Math.round(x(mark.hz));
    context.fillStyle = token("--text-muted");
    for (let dash = 0; dash < plotHeight; dash += 6) context.fillRect(at, dash, 1, 3);
    context.textAlign = at > width - 60 ? "right" : "left";
    context.fillText(mark.label, at + (at > width - 60 ? -4 : 4), FONT_PX + 4);
  }
}
