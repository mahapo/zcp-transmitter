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
}>();

const lit = computed(() => Math.round(Math.max(0, Math.min(1, props.value)) * props.segments));

function zone(segment: number): string {
  const [green, yellow] = props.zones ?? [0.7, 0.9];
  const position = segment / props.segments;
  return position <= green ? "green" : position <= yellow ? "yellow" : "red";
}
</script>

<template>
  <div class="meter" :class="{ vertical }">
    <i v-for="segment in segments" :key="segment" :class="[zone(segment), { lit: segment <= lit }]" />
  </div>
</template>
