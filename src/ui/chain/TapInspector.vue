<script setup lang="ts">
// The signal after the selected block: its waveform, with the pulses it leads
// to, and its spectrum. Both follow the stretch the waterfall shows.
import { computed, ref } from "vue";
import { STAGES } from "../../dsp/chain.ts";
import { spectrumDb } from "../../dsp/analysis.ts";
import { AUDIO_RATE } from "../../dsp/config.ts";
import { signalAt } from "../../dsp/stages.ts";
import { session } from "../../state/session.ts";
import { live, tick } from "../../engine/instruments.ts";
import { signal } from "../../state/signal.ts";
import { LIVE_WINDOWS_MS, ui } from "../../state/ui.ts";
import { text } from "../../text.ts";
import { paintScope, paintSpectrum } from "../canvas/plotPaint.ts";
import { token } from "../canvas/theme.ts";
import { useCanvas } from "../canvas/useCanvas.ts";
import UiBadge from "../primitives/UiBadge.vue";
import UiIcon from "../primitives/UiIcon.vue";
import UiSegmented from "../primitives/UiSegmented.vue";
import { stageInfo } from "./stages.ts";

const SAMPLES_PER_MS = AUDIO_RATE / 1000;
const LIVE_SPECTRUM_SAMPLES = AUDIO_RATE / 2;
const t = text.chain;
const windows = LIVE_WINDOWS_MS.map((ms) => ({ value: String(ms), label: t.window(ms) }));
const liveWindow = computed({ get: () => String(ui.liveWindowMs), set: (value) => (ui.liveWindowMs = Number(value)) });

const scope = ref<HTMLCanvasElement>();
const spectrum = ref<HTMLCanvasElement>();

/** While the microphone is on, the plots follow its chain instead of the take. */
const isLive = computed(() => signal.micOn);
const selected = computed(() => stageInfo(signal.stage));
/** The stage whose output is the signal at the selected block: a filter that is off passes it on unchanged. */
const shownStage = computed(() => {
  if (isLive.value) return signalAt(signal.stage, session.config.filters);
  return signal.take ? signalAt(signal.stage, signal.take.config.filters) : signal.stage;
});
const tap = computed(() => (isLive.value ? undefined : signal.take?.taps.get(shownStage.value)));
/** Where the tap's first sample lies on the time axis of the pulses, which the waterfall uses. */
const offset = computed(() => {
  const take = signal.take;
  return take?.audio && tap.value ? tap.value.skipped - (take.audio.length - take.pulses.length) : 0;
});
/** The stretch in view, in pulse samples. */
const span = computed(() => {
  const length = signal.take?.pulses.length ?? 0;
  return ui.span ? { from: ui.span.fromMs * SAMPLES_PER_MS, to: ui.span.toMs * SAMPLES_PER_MS } : { from: 0, to: length };
});
const peak = computed(() => {
  const known = signal.take?.peaks?.[STAGES.indexOf(shownStage.value)];
  if (known !== undefined && known > 0) return known;
  let found = 0;
  for (const value of tap.value?.samples ?? []) found = Math.max(found, Math.abs(value));
  return found || 1;
});
const levels = computed(() => {
  if (isLive.value) return tick.value >= 0 ? spectrumDb(live.stage.latest(LIVE_SPECTRUM_SAMPLES)) : undefined;
  return tap.value ? spectrumDb(tap.value.samples, span.value.from - offset.value, span.value.to - offset.value) : undefined;
});
const hasSignal = computed(() => isLive.value || tap.value !== undefined);
const color = computed(() => (shownStage.value === "pulse" ? "--trace-pulse" : shownStage.value === "input" ? "--trace-input" : "--trace-stage"));

/** The microphone's chain over the last moments, the latest at the right edge. */
function paintLive(context: CanvasRenderingContext2D, width: number, height: number) {
  const count = Math.round(ui.liveWindowMs * SAMPLES_PER_MS);
  const unipolar = shownStage.value === "pulse";
  const samples = live.stage.latest(count);
  let level = 0;
  for (const value of samples) level = Math.max(level, Math.abs(value));
  paintScope(context, width, height, {
    from: 0,
    to: count,
    sampleRate: AUDIO_RATE,
    traces: [{ samples, offset: 0, scale: unipolar ? 1 : Math.max(1e-3, level * 1.08), unipolar, color: token(color.value) }],
    pulses: unipolar ? undefined : { samples: live.pulses.latest(count), offset: 0 },
    note: unipolar ? undefined : t.peak(level),
  });
}

useCanvas(
  scope,
  (context, width, height) => {
    if (isLive.value) return paintLive(context, width, height);
    const take = signal.take;
    if (!take || !tap.value) return;
    const unipolar = shownStage.value === "pulse";
    paintScope(context, width, height, {
      ...span.value,
      sampleRate: AUDIO_RATE,
      traces: [{ samples: tap.value.samples, offset: offset.value, scale: unipolar ? 1 : peak.value * 1.08, unipolar, color: token(color.value) }],
      pulses: unipolar ? undefined : { samples: take.pulses, offset: 0 },
      cursor: ui.cursorMs === null ? null : ui.cursorMs * SAMPLES_PER_MS,
      playhead: ui.playheadMs === null ? null : ui.playheadMs * SAMPLES_PER_MS,
      note: unipolar ? undefined : t.peak(peak.value),
    });
  },
  [() => signal.take, tap, span, () => ui.cursorMs, () => ui.playheadMs, isLive, tick, () => ui.liveWindowMs],
);

useCanvas(
  spectrum,
  (context, width, height) => {
    const config = isLive.value ? session.config : signal.take?.config;
    if (!config || !levels.value) return;
    paintSpectrum(context, width, height, {
      db: levels.value,
      binHz: AUDIO_RATE / (2 * (levels.value.length - 1)),
      color: token(color.value),
      marks: [
        { hz: config.hpfHz, label: t.sliders.hpfHz.label },
        { hz: config.lpfHz, label: t.sliders.lpfHz.label },
      ],
      format: t.hertz,
    });
  },
  [levels],
);

function onPointer(event: PointerEvent) {
  if (isLive.value) return;
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const { from, to } = span.value;
  ui.cursorMs = (from + ((event.clientX - bounds.left) / bounds.width) * (to - from)) / SAMPLES_PER_MS;
}
</script>

<template>
  <section class="inspector" :aria-label="t.inspector">
    <header class="head">
      <span class="label">{{ t.after }}</span>
      <strong class="stage">{{ selected.name }}</strong>
      <span v-if="shownStage !== signal.stage" class="hint bypass">{{ t.bypassed(stageInfo(shownStage).name) }}</span>
      <span v-else class="hint about" :title="selected.about">{{ selected.about }}</span>
      <template v-if="isLive">
        <UiSegmented v-model="liveWindow" :options="windows" :label="t.windowLabel" size="s" class="state" />
        <UiBadge tone="ok" dot>{{ t.live }}</UiBadge>
      </template>
      <UiBadge v-else-if="signal.take?.audio" :tone="signal.take.sent ? 'neutral' : 'accent'" :title="signal.take.sent ? undefined : t.previewNote" class="state">
        {{ signal.take.sent ? t.sent : t.preview }}
      </UiBadge>
    </header>

    <div v-show="hasSignal" class="plots" :class="{ busy: signal.previewing && !isLive }">
      <div class="plot scope" @pointermove="onPointer" @pointerleave="ui.cursorMs = null">
        <canvas ref="scope" role="img" :aria-label="t.scope(selected.name)" />
      </div>
      <div class="plot">
        <canvas ref="spectrum" role="img" :aria-label="t.spectrum(selected.name)" />
      </div>
    </div>
    <div v-if="!hasSignal" class="empty">
      <UiIcon name="activity" :size="24" />
      <p>{{ signal.take ? t.noTap : t.noTake }}</p>
    </div>
  </section>
</template>

<style scoped>
.inspector {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  min-height: 170px;
}

.head {
  display: flex;
  flex: none;
  gap: var(--s2);
  align-items: center;
  min-height: 32px;
  padding: var(--s2) var(--s3) 0;
}

.stage {
  font-size: var(--text-m);
  font-weight: 600;
  white-space: nowrap;
}

.about,
.bypass {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bypass {
  color: var(--warn);
}

.state {
  margin-left: auto;
}

.plots {
  display: grid;
  flex: 1 1 0;
  grid-template-rows: minmax(0, 1fr);
  grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr);
  gap: var(--s2);
  min-height: 0;
  padding: var(--s2) var(--s3) var(--s3);
  transition: opacity var(--fast) var(--ease);
}

.plots.busy {
  opacity: 0.6;
}

/* A canvas fills its box without taking part in layout, or its own size would feed back into it. */
.plot {
  position: relative;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--r1);
}

canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.scope {
  cursor: crosshair;
}

.empty {
  display: grid;
  flex: 1;
  place-content: center;
  place-items: center;
  gap: var(--s2);
  padding: var(--s4);
  margin: var(--s2) var(--s3) var(--s3);
  color: var(--text-faint);
  text-align: center;
  background: var(--plot-bg);
  border: 1px dashed var(--line-strong);
  border-radius: var(--r1);
}

@container (max-width: 560px) {
  .plots {
    grid-template-rows: repeat(2, minmax(0, 1fr));
    grid-template-columns: minmax(0, 1fr);
  }

  .inspector {
    min-height: 300px;
  }
}
</style>
