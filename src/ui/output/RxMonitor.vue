<script setup lang="ts">
// The receive monitor: what the SDR's own receiver hears on the transmit frequency.
import { computed, ref } from "vue";
import { setRxGain, startRx, stopRx } from "../../engine/engine.ts";
import { rxScope, rxTick } from "../../engine/receiver.ts";
import { radio } from "../../state/radio.ts";
import { text } from "../../text.ts";
import { paintScope } from "../canvas/plotPaint.ts";
import { token } from "../canvas/theme.ts";
import { useCanvas } from "../canvas/useCanvas.ts";
import UiBadge from "../primitives/UiBadge.vue";
import UiButton from "../primitives/UiButton.vue";
import UiIcon from "../primitives/UiIcon.vue";
import UiSlider from "../primitives/UiSlider.vue";

const BLOCK_MS = 50; // the stretch one block of the receiver covers
const t = text.rx;

const scope = ref<HTMLCanvasElement>();
const gain = computed(() => radio.device?.caps.rxGain);
const on = computed(() => radio.rx !== "off");
const changing = computed(() => radio.rx === "starting" || radio.rx === "stopping");
const level = computed(() => radio.rxLevel);

useCanvas(
  scope,
  (context, width, height) => {
    const { envelope, peak, noise, fullScale } = rxScope;
    // Room above the pulses, or above the noise when there are none; never beyond what the converter can give.
    const scale = Math.min(fullScale * 1.45, Math.max(noise * 6, peak * 1.3, 1));
    // The axis is in ms: one point of the envelope per 1/12 ms.
    paintScope(context, width, height, {
      from: 0,
      to: envelope.length,
      sampleRate: (envelope.length / BLOCK_MS) * 1000,
      traces: [{ samples: envelope, offset: 0, scale, unipolar: true, color: token("--trace-rx") }],
    });
  },
  [rxTick, on],
);
</script>

<template>
  <section v-if="gain" class="rx" :aria-label="t.title">
    <header class="head">
      <h3 class="label">{{ t.title }}</h3>
      <UiBadge :tone="radio.rx === 'on' ? 'ok' : 'neutral'" dot>{{ t.state[radio.rx] }}</UiBadge>
      <UiButton size="s" :icon="on ? 'square' : 'antenna'" :busy="changing" :disabled="changing" class="toggle" :aria-label="on ? t.stop : t.start" @click="on ? stopRx() : startRx()">
        {{ on ? t.stopShort : t.startShort }}
      </UiButton>
    </header>
    <UiSlider :model-value="radio.rxGain" :min="gain.min" :max="gain.max" :step="gain.step" :label="t.gain" :readout="t.gainReadout(radio.rxGain)" @update:model-value="setRxGain" />

    <template v-if="on">
      <div class="plot"><canvas ref="scope" role="img" :aria-label="t.scope" /></div>
      <dl class="readings">
        <div>
          <dt>{{ t.level }}</dt>
          <dd class="num">{{ level ? t.dbfs(level.rmsDb) : t.none }}</dd>
        </div>
        <div>
          <dt>{{ t.noise }}</dt>
          <dd class="num">{{ level ? t.dbfs(level.noiseDb) : t.none }}</dd>
        </div>
        <div>
          <dt>{{ t.pulseLevel }}</dt>
          <dd class="num">{{ level?.peakDb != null ? t.dbfs(level.peakDb) : t.none }}</dd>
        </div>
        <div>
          <dt>{{ t.aboveNoise }}</dt>
          <dd class="num">{{ level?.snrDb != null ? t.decibel(level.snrDb) : t.none }}</dd>
        </div>
        <div>
          <dt>{{ t.pulseRate }}</dt>
          <dd class="num">{{ level ? text.instruments.perSecond(level.pulseRate) : t.none }}</dd>
        </div>
        <div>
          <dt>{{ t.duty }}</dt>
          <dd class="num">{{ level ? text.chain.percent(level.duty) : t.none }}</dd>
        </div>
      </dl>
      <dl v-if="radio.tx === 'on'" class="readings loop">
        <div class="whole">
          <dt>{{ t.loopback }}</dt>
          <dd class="num">{{ radio.loopback ? t.found(radio.loopback.matched, radio.loopback.sent) : t.waiting }}</dd>
        </div>
        <template v-if="radio.loopback">
          <div>
            <dt>{{ t.missing }}</dt>
            <dd class="num">{{ radio.loopback.missing }}</dd>
          </div>
          <div>
            <dt>{{ t.extra }}</dt>
            <dd class="num">{{ radio.loopback.extra }}</dd>
          </div>
          <div class="whole">
            <dt>{{ t.delay }}</dt>
            <dd class="num">{{ t.milliseconds(radio.loopback.lagMs) }}</dd>
          </div>
        </template>
      </dl>
      <p v-if="level?.clipped" class="hint warn" role="alert"><UiIcon name="warning" :size="14" />{{ t.clipped }}</p>
    </template>
    <p v-else class="hint">{{ t.about }} {{ t.cable }}</p>
  </section>
</template>

<style scoped>
.rx {
  display: flex;
  flex-direction: column;
  gap: var(--s2);
  padding-top: var(--s3);
  border-top: 1px solid var(--line);
}

.head {
  display: flex;
  gap: var(--s2);
  align-items: center;
  white-space: nowrap;
}

.toggle {
  margin-left: auto;
}

.plot {
  position: relative;
  height: 64px;
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

.readings {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 2px var(--s4);
  margin: 0;
  font-size: var(--text-s);
}

.readings div {
  display: flex;
  gap: var(--s2);
  justify-content: space-between;
  min-width: 0;
}

.readings .whole {
  grid-column: 1 / -1;
}

.loop {
  padding-top: var(--s2);
  border-top: 1px solid var(--line);
}

dt {
  overflow: hidden;
  color: var(--text-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

dd {
  margin: 0;
  white-space: nowrap;
}

.warn {
  display: flex;
  gap: 6px;
  align-items: center;
  color: var(--warn);
}
</style>
