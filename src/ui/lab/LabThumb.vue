<script setup lang="ts">
// A waterfall thumbnail: one image pixel per column and bin, scaled by the browser.
import { onMounted, ref, watch } from "vue";
import { FFT_SIZE, INFERNO } from "../../dsp/spectrogram.ts";

const props = defineProps<{ thumb: Uint8Array; columns: number; label: string }>();
const canvas = ref<HTMLCanvasElement>();

function paint() {
  const target = canvas.value;
  if (!target || props.columns === 0) return;
  target.width = props.columns;
  target.height = FFT_SIZE;
  const image = new ImageData(props.columns, FFT_SIZE);
  for (let x = 0; x < props.columns; x++) {
    for (let bin = 0; bin < FFT_SIZE; bin++) {
      const level = props.thumb[x * FFT_SIZE + bin];
      const at = 4 * ((FFT_SIZE - 1 - bin) * props.columns + x); // highest frequency on top
      image.data[at] = INFERNO[3 * level];
      image.data[at + 1] = INFERNO[3 * level + 1];
      image.data[at + 2] = INFERNO[3 * level + 2];
      image.data[at + 3] = 255;
    }
  }
  target.getContext("2d")!.putImageData(image, 0, 0);
}

onMounted(paint);
watch(() => props.thumb, paint);
</script>

<template>
  <canvas ref="canvas" class="thumb" role="img" :aria-label="label" />
</template>

<style scoped>
.thumb {
  display: block;
  width: 100%;
  height: 100%;
  background: #000;
}
</style>
