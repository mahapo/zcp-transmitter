<script setup lang="ts">
// Duty cycle now and at its highest, as in the original app: the meters top out at 10 %.
import { signal } from "../../state/signal.ts";
import { text } from "../../text.ts";
import SegmentMeter from "../instruments/SegmentMeter.vue";
import UiIcon from "../primitives/UiIcon.vue";

const DUTY_FULL_SCALE = 0.1;
const DUTY_ZONES: [number, number] = [0.4, 0.65];
const t = text.chain;
</script>

<template>
  <div class="duty" role="group" :aria-label="t.duty">
    <div class="row">
      <span class="label">{{ t.dutyLive }}</span>
      <SegmentMeter :value="signal.dutyLive / DUTY_FULL_SCALE" :segments="20" :zones="DUTY_ZONES" :label="`${t.duty}, ${t.dutyLive}`" :value-text="t.percent(signal.dutyLive)" />
      <output class="num">{{ t.percent(signal.dutyLive) }}</output>
    </div>
    <div class="row">
      <span class="label">{{ t.dutyPeak }}</span>
      <SegmentMeter :value="signal.dutyPeak / DUTY_FULL_SCALE" :segments="20" :zones="DUTY_ZONES" :label="`${t.duty}, ${t.dutyPeak}`" :value-text="t.percent(signal.dutyPeak)" />
      <output class="num">{{ t.percent(signal.dutyPeak) }}</output>
    </div>
    <button type="button" class="reset" :title="t.resetPeak" :aria-label="t.resetPeak" @click="signal.dutyPeak = 0"><UiIcon name="reset" :size="14" /></button>
  </div>
</template>

<style scoped>
.duty {
  display: flex;
  gap: var(--s4);
  align-items: center;
}

.row {
  display: grid;
  flex: 1;
  grid-template-columns: auto minmax(40px, 1fr) 3.6em;
  gap: var(--s2);
  align-items: center;
  min-width: 0;
}

output {
  font-size: var(--text-s);
  text-align: right;
}

.reset {
  display: grid;
  flex: none;
  place-items: center;
  width: var(--control-small);
  height: var(--control-small);
  margin-left: calc(-1 * var(--s3));
  color: var(--text-faint);
  background: none;
  border: 0;
  border-radius: var(--r1);
}

.reset:hover {
  color: var(--text);
  background: var(--surface-3);
}

@container (max-width: 520px) {
  .duty {
    flex-wrap: wrap;
  }
}
</style>
