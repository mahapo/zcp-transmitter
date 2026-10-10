<script setup lang="ts">
// The pulse waterfall: spectrogram on top, |IQ| below, scrollable when zoomed in.
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { FFT_SIZE, INFERNO, type Spectrogram } from "../dsp/spectrogram.ts";
import { download, fileStamp } from "../engine/engine.ts";

const props = defineProps<{ title: string; data: Spectrogram }>();

const ZOOMS = [0, 2, 10, 40]; // px per ms; 0 fits everything
const HEIGHT = 280; // CSS px
const ENVELOPE_SHARE = 0.25;
// The reference PNGs are 40 px per ms and at least 1500 px wide; a canvas cannot be much wider than this.
const PNG = { pxPerMs: 40, minWidth: 1500, maxWidth: 16000, height: 900 };

const pxPerMs = ref(40); // the scale of the reference images: a 100 µs pulse is 4 px wide
const scroller = ref<HTMLDivElement>();
const canvas = ref<HTMLCanvasElement>();
const viewWidth = ref(0);

const durationMs = computed(() => (props.data.length / props.data.sampleRate) * 1000);
const totalWidth = computed(() => Math.max(viewWidth.value, pxPerMs.value * durationMs.value));
const summary = computed(() => {
  const { hop, sampleRate } = props.data;
  return `${props.title} · ${durationMs.value.toFixed(0)} ms active · hop ${((hop / sampleRate) * 1e6).toFixed(0)} µs`;
});

/** Paints analysed samples `from`..`to` across the whole of `target`. */
function paint(target: HTMLCanvasElement, from: number, to: number, caption?: string) {
  const { data } = props;
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
  context.fillStyle = "#fff";
  context.fillRect(0, imageHeight, width, envelopeHeight);
  context.fillStyle = "#2a6ebb";
  const barTop = imageHeight + Math.round(envelopeHeight * 0.2);
  const baseline = height - Math.round(envelopeHeight * 0.3);
  for (let x = 0; x < width; x++) if (pulsed[x]) context.fillRect(x, barTop, 1, baseline - barTop);
  context.fillRect(0, baseline, width, 1);

  // Labels: frequency offset on the left, time along the bottom.
  const font = Math.max(10, Math.round(height / 26));
  const label = (text: string, x: number, y: number, color: string, align: CanvasTextAlign = "left") => {
    context.font = `${font}px ui-monospace, Menlo, monospace`;
    context.textAlign = align;
    context.fillStyle = color;
    context.fillText(text, x, y);
  };
  const halfMhz = (data.sampleRate / 2e6).toFixed(1);
  label(`+${halfMhz} MHz`, 4, font + 2, "#fff");
  label("0", 4, imageHeight / 2 + font / 3, "#fff");
  label(`-${halfMhz} MHz`, 4, imageHeight - 5, "#fff");
  label("|IQ|", 4, barTop - 3, "#444");
  if (caption) label(caption, width - 6, font + 2, "#fff", "right");

  const msPerPixel = (perPixel / data.sampleRate) * 1000;
  const step = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].find((ms) => ms / msPerPixel >= font * 6) ?? 1000;
  const startMs = ((data.start + from) / data.sampleRate) * 1000;
  for (let ms = Math.ceil(startMs / step) * step; ms < startMs + width * msPerPixel; ms += step) {
    const x = (ms - startMs) / msPerPixel;
    context.fillStyle = "#444";
    context.fillRect(x, baseline, 1, 4);
    label(`${+ms.toFixed(1)} ms`, x + 3, height - 4, "#444");
  }
}

let frame = 0;
function draw() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    const box = scroller.value;
    const target = canvas.value;
    if (!box || !target || box.clientWidth === 0) return;
    viewWidth.value = box.clientWidth;
    const ratio = devicePixelRatio || 1;
    target.width = Math.round(box.clientWidth * ratio);
    target.height = Math.round(HEIGHT * ratio);
    const { length } = props.data;
    const from = (box.scrollLeft / totalWidth.value) * length;
    paint(target, from, Math.min(length, from + (box.clientWidth / totalWidth.value) * length));
  });
}

function savePng() {
  const target = document.createElement("canvas");
  target.width = Math.min(PNG.maxWidth, Math.max(PNG.minWidth, Math.round(durationMs.value * PNG.pxPerMs)));
  target.height = PNG.height;
  paint(target, 0, props.data.length, summary.value);
  const name = props.title.endsWith(".iq") ? props.title.replace(/\.iq$/, ".png") : `zcp_${fileStamp()}.png`;
  target.toBlob((blob) => blob && download(blob, name));
}

const resized = new ResizeObserver(draw);
onMounted(() => {
  resized.observe(scroller.value!);
  draw();
});
onBeforeUnmount(() => resized.disconnect());
watch(() => props.data, () => {
  if (scroller.value) scroller.value.scrollLeft = 0;
  draw();
});
watch(pxPerMs, draw, { flush: "post" });
</script>

<template>
  <section class="panel spectrogram">
    <h2 class="bar">Spectrogram</h2>
    <div class="spectrogram-head">
      <span class="readout">{{ summary }}</span>
      <label>
        Zoom
        <select v-model.number="pxPerMs">
          <option v-for="zoom in ZOOMS" :key="zoom" :value="zoom">{{ zoom ? `${zoom} px/ms` : "Fit" }}</option>
        </select>
      </label>
      <button class="small" @click="savePng">Save PNG</button>
    </div>
    <div ref="scroller" class="scroller" @scroll="draw">
      <canvas ref="canvas" :style="{ height: `${HEIGHT}px` }" />
      <div class="spacer" :style="{ width: `${totalWidth}px` }" />
    </div>
  </section>
</template>
