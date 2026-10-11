<script setup lang="ts">
// What has gone out lately: a rolling waterfall, how the pulses are spaced and
// how busy the transmitter has been.
import { ref } from "vue";
import { AUDIO_RATE } from "../../dsp/config.ts";
import { ROLLING_COLUMN_SECONDS } from "../../dsp/waterfall.ts";
import { ROLLING_COLUMNS, air, tick } from "../../engine/instruments.ts";
import { text } from "../../text.ts";
import { paintHistogram, paintHistory, paintRolling } from "../canvas/instrumentPaint.ts";
import { token } from "../canvas/theme.ts";
import { useCanvas } from "../canvas/useCanvas.ts";

const DUTY_FULL_SCALE = 0.1; // as the duty meters
const t = text.instruments;

const waterfall = ref<HTMLCanvasElement>();
const histogram = ref<HTMLCanvasElement>();
const history = ref<HTMLCanvasElement>();

useCanvas(
  waterfall,
  (context, width, height) =>
    paintRolling(context, width, height, { columns: air.columns, count: air.columnCount, capacity: ROLLING_COLUMNS, columnSeconds: ROLLING_COLUMN_SECONDS }),
  [tick],
);
useCanvas(
  histogram,
  (context, width, height) => {
    const gaps = air.gaps.latest(Math.min(air.gaps.capacity, air.gaps.total));
    paintHistogram(context, width, height, gaps.map((samples) => (samples / AUDIO_RATE) * 1000));
  },
  [tick],
);
useCanvas(history, (context, width, height) => paintHistory(context, width, height, air.duty.latest(air.duty.capacity), DUTY_FULL_SCALE, token("--trace-pulse")), [tick]);
</script>

<template>
  <div class="instruments">
    <figure class="plot wide">
      <figcaption class="label">{{ t.rolling }}</figcaption>
      <div class="box black"><canvas ref="waterfall" role="img" :aria-label="t.rollingAbout" /></div>
    </figure>
    <figure class="plot">
      <figcaption class="label">{{ t.spacing }}</figcaption>
      <div class="box"><canvas ref="histogram" role="img" :aria-label="t.spacingAbout" /></div>
    </figure>
    <figure class="plot">
      <figcaption class="label">{{ t.dutyHistory }}</figcaption>
      <div class="box"><canvas ref="history" role="img" :aria-label="t.dutyHistoryAbout" /></div>
    </figure>
  </div>
</template>

<style scoped>
.instruments {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--s2);
  height: 100%;
  padding: var(--s2);
}

.plot {
  display: flex;
  flex-direction: column;
  gap: var(--s1);
  min-width: 0;
  min-height: 0;
  margin: 0;
}

.box {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: var(--plot-bg);
  border: 1px solid var(--line);
  border-radius: var(--r1);
}

.box.black {
  background: #000;
}

canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

@media (max-width: 899px) {
  .instruments {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }

  .wide {
    grid-column: 1 / -1;
  }
}
</style>
