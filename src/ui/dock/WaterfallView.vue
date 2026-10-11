<script setup lang="ts">
// The pulse waterfall of the latest utterance or recording: spectrogram on top,
// |IQ| below, scrollable when zoomed in.
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { fail } from "../../engine/status.ts";
import { download, fileStamp } from "../../lib/download.ts";
import { signal } from "../../state/signal.ts";
import { WATERFALL_ZOOMS, ui } from "../../state/ui.ts";
import { text } from "../../text.ts";
import { themeRevision, token } from "../canvas/theme.ts";
import { IMAGE_SHARE, type WaterfallLook, paintWaterfall } from "../canvas/waterfallPaint.ts";
import { waterfallPng } from "../canvas/waterfallPng.ts";
import UiButton from "../primitives/UiButton.vue";
import UiIcon from "../primitives/UiIcon.vue";
import UiSelect from "../primitives/UiSelect.vue";
import ExportDialog from "../session/ExportDialog.vue";

const t = text.dock;

const pxPerMs = computed({ get: () => ui.waterfallZoom, set: (value) => (ui.waterfallZoom = value) });
const zoom = computed({ get: () => String(pxPerMs.value), set: (value) => (pxPerMs.value = Number(value)) });
const scroller = ref<HTMLDivElement>();
const canvas = ref<HTMLCanvasElement>();
const view = ref({ width: 0, height: 0 });
/** The frequency offset under the pointer, when it is over the spectrogram. */
const pointerMhz = ref<number>();
const exporting = ref(false);

const shown = computed(() => (signal.take?.spectrogram ? { title: signal.take.title, data: signal.take.spectrogram } : null));
const durationMs = computed(() => (shown.value ? (shown.value.data.length / shown.value.data.sampleRate) * 1000 : 0));
const totalWidth = computed(() => Math.max(view.value.width, pxPerMs.value * durationMs.value));
const summary = computed(() => {
  if (!shown.value) return "";
  const { hop, sampleRate } = shown.value.data;
  return t.summary(shown.value.title, durationMs.value, (hop / sampleRate) * 1e6);
});

/** The colours of the |IQ| strip follow the theme; the spectrogram itself is inferno on black in both. */
function screenLook(): WaterfallLook {
  return { strip: token("--plot-bg"), bar: token("--trace-pulse"), axis: token("--text-faint"), onImage: "#fff", font: token("--font-mono") };
}

/** The analysed samples that are in view: first, and how many. */
function span(): { from: number; count: number } {
  const { length } = shown.value!.data;
  const box = scroller.value!;
  const from = (box.scrollLeft / totalWidth.value) * length;
  return { from, count: Math.min(length - from, (box.clientWidth / totalWidth.value) * length) };
}

let frame = 0;
let pending = false;
function draw() {
  if (pending) return;
  pending = true;
  frame = requestAnimationFrame(() => {
    pending = false;
    const box = scroller.value;
    const target = canvas.value;
    if (!box || !target || !shown.value || box.clientWidth === 0 || box.clientHeight === 0) return;
    view.value = { width: box.clientWidth, height: box.clientHeight };
    const ratio = devicePixelRatio || 1;
    target.width = Math.round(box.clientWidth * ratio);
    target.height = Math.round(box.clientHeight * ratio);
    const { from, count } = span();
    const { data } = shown.value;
    paintWaterfall(target, data, from, from + count, screenLook());
    ui.span = { fromMs: ((data.start + from) / data.sampleRate) * 1000, toMs: ((data.start + from + count) / data.sampleRate) * 1000 };
  });
}

/** The shared cursor, as a position in this view and what it points at. */
const cursor = computed(() => {
  if (ui.cursorMs === null || !ui.span || !shown.value) return null;
  const share = (ui.cursorMs - ui.span.fromMs) / (ui.span.toMs - ui.span.fromMs);
  if (share < 0 || share > 1) return null;
  const label = pointerMhz.value === undefined ? `${ui.cursorMs.toFixed(2)} ms` : t.cursor(ui.cursorMs, pointerMhz.value);
  return { x: share * view.value.width, label };
});

async function savePng() {
  if (!shown.value) return;
  const { title, data } = shown.value;
  try {
    download(await waterfallPng(data, summary.value), title.endsWith(".iq") ? title.replace(/\.iq$/, ".png") : `zcp_${fileStamp()}.png`);
  } catch (error) {
    fail(error);
  }
}

/** Where the monitor is playing, as a position in this view. */
const playhead = computed(() => {
  if (ui.playheadMs === null || !ui.span) return null;
  const share = (ui.playheadMs - ui.span.fromMs) / (ui.span.toMs - ui.span.fromMs);
  return share < 0 || share > 1 ? null : share * view.value.width;
});

function onPointer(event: PointerEvent) {
  if (!scroller.value || !ui.span) return;
  const bounds = scroller.value.getBoundingClientRect();
  const imageHeight = bounds.height * IMAGE_SHARE;
  const y = event.clientY - bounds.top;
  ui.cursorMs = ui.span.fromMs + ((event.clientX - bounds.left) / bounds.width) * (ui.span.toMs - ui.span.fromMs);
  // Above the |IQ| strip the pointer is also at a frequency offset.
  pointerMhz.value = y < imageHeight ? ((0.5 - y / imageHeight) * shown.value!.data.sampleRate) / 1e6 : undefined;
}

function onLeave() {
  ui.cursorMs = null;
  pointerMhz.value = undefined;
}

const resized = new ResizeObserver(draw);
onMounted(() => {
  if (scroller.value) resized.observe(scroller.value);
  draw();
});
onBeforeUnmount(() => {
  resized.disconnect();
  cancelAnimationFrame(frame);
});
watch(shown, (now, before) => {
  // A preview of the same take keeps its place; anything else starts from the left.
  if (scroller.value && now?.title !== before?.title) scroller.value.scrollLeft = 0;
  if (!now) ui.span = null;
  draw();
});
watch([pxPerMs, themeRevision], draw, { flush: "post" });
</script>

<template>
  <Teleport defer to="#dock-tools">
    <span class="num summary" :title="summary">{{ summary }}</span>
    <UiSelect v-model="zoom" :label="t.zoom" size="s" :disabled="!shown">
      <option v-for="each in WATERFALL_ZOOMS" :key="each" :value="String(each)">{{ each ? t.pxPerMs(each) : t.fit }}</option>
    </UiSelect>
    <UiButton size="s" icon="image" :disabled="!shown" @click="savePng">{{ t.savePng }}</UiButton>
    <UiButton size="s" icon="archive" :disabled="!signal.take" @click="exporting = true">{{ text.exporting.button }}</UiButton>
  </Teleport>
  <ExportDialog :open="exporting" :caption="summary" @close="exporting = false" />

  <div v-show="shown" class="frame" @pointermove="onPointer" @pointerleave="onLeave">
    <div ref="scroller" class="scroller" @scroll="draw">
      <canvas ref="canvas" role="img" :aria-label="shown ? t.canvas(shown.title) : undefined" />
      <div class="spacer" :style="{ width: `${totalWidth}px` }" />
    </div>
    <div v-if="playhead !== null" class="playhead" :style="{ left: `${playhead}px` }" aria-hidden="true" />
    <div v-if="cursor" class="cursor" :style="{ left: `${cursor.x}px` }" aria-hidden="true">
      <span class="num" :class="{ flip: cursor.x > view.width - 190 }">{{ cursor.label }}</span>
    </div>
  </div>
  <div v-if="!shown" class="empty">
    <UiIcon name="activity" :size="28" />
    <p>{{ t.empty }}</p>
  </div>
</template>

<style scoped>
.summary {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: var(--text-xs);
  color: var(--text-faint);
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.frame {
  position: relative;
  height: 100%;
  background: #000;
}

.scroller {
  height: 100%;
  overflow: auto hidden;
}

canvas {
  position: sticky;
  left: 0;
  display: block;
  width: 100%;
  height: 100%;
}

.spacer {
  height: 1px;
  margin-top: -1px;
}

.cursor {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  pointer-events: none;
  background: rgb(255 255 255 / 0.55);
}

.playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  margin-left: -1px;
  pointer-events: none;
  background: var(--accent);
}

.cursor span {
  position: absolute;
  top: 6px;
  left: 6px;
  padding: 2px 6px;
  font-size: var(--text-xs);
  color: #fff;
  white-space: nowrap;
  background: rgb(0 0 0 / 0.7);
  border-radius: var(--r1);
}

.cursor span.flip {
  right: 6px;
  left: auto;
}

.empty {
  display: grid;
  place-content: center;
  place-items: center;
  gap: var(--s2);
  height: 100%;
  padding: var(--s4);
  color: var(--text-faint);
  text-align: center;
  background: var(--plot-bg);
}
</style>
