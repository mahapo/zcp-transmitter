<script setup lang="ts">
// A bar of segments that light up green, then yellow, then red.
import { computed } from "vue";

const props = defineProps<{
  /** 0..1; values outside are clamped. */
  value: number;
  segments: number;
  vertical?: boolean;
  /** Share of the bar that is green and the share up to which it is yellow. */
  zones?: [number, number];
  /** What is measured and its value in words, for screen readers. */
  label: string;
  valueText: string;
}>();

const level = computed(() => Math.max(0, Math.min(1, props.value)));
const lit = computed(() => Math.round(level.value * props.segments));

function zone(segment: number): string {
  const [green, yellow] = props.zones ?? [0.7, 0.9];
  const position = segment / props.segments;
  return position <= green ? "green" : position <= yellow ? "yellow" : "red";
}
</script>

<template>
  <div class="meter" :class="{ vertical }" role="meter" :aria-label="label" aria-valuemin="0" aria-valuemax="1" :aria-valuenow="level" :aria-valuetext="valueText">
    <i v-for="segment in segments" :key="segment" :class="[zone(segment), { lit: segment <= lit }]" />
  </div>
</template>

<style scoped>
.meter {
  display: flex;
  gap: 2px;
  height: 12px;
}

.meter i {
  flex: 1;
  background: var(--meter-off);
  border-radius: 1px;
  transition: background 60ms linear;
}

.meter i.lit.green {
  background: var(--meter-green);
}

.meter i.lit.yellow {
  background: var(--meter-yellow);
}

.meter i.lit.red {
  background: var(--meter-red);
}

.meter.vertical {
  flex-direction: column-reverse;
  width: 12px;
  height: 100%;
}
</style>
