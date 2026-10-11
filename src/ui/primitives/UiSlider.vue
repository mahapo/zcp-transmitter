<script setup lang="ts">
// A labelled slider with its value beside it. It is the browser's own range input, so keys and touch work as expected.
import { computed, useId } from "vue";

const props = defineProps<{
  modelValue: number;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  /** The value as shown, e.g. "100 µs". */
  readout: string;
  disabled?: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [value: number] }>();

const id = useId();
const fill = computed(() => {
  const { min = 0, max = 100, modelValue } = props;
  return `${max > min ? Math.max(0, Math.min(100, (100 * (modelValue - min)) / (max - min))) : 0}%`;
});
</script>

<template>
  <div class="slider" :class="{ disabled }">
    <label :for="id" class="name">{{ label }}</label>
    <input
      :id="id"
      type="range"
      :min="min"
      :max="max"
      :step="step"
      :value="modelValue"
      :disabled="disabled"
      :aria-valuetext="readout"
      :style="{ '--fill': fill }"
      @input="emit('update:modelValue', Number(($event.target as HTMLInputElement).value))"
    />
    <output :for="id" class="num value">{{ readout }}</output>
  </div>
</template>

<style scoped>
.slider {
  display: grid;
  grid-template-columns: var(--slider-label, 4.5em) minmax(60px, 1fr) var(--slider-value, 5.5em);
  gap: var(--s3);
  align-items: center;
  min-height: var(--control);
}

.name {
  font-size: var(--text-s);
  font-weight: 600;
  color: var(--text-muted);
}

.value {
  font-size: var(--text-s);
  text-align: right;
}

.disabled {
  opacity: 0.45;
}

input {
  width: 100%;
  height: 16px;
  margin: 0;
  appearance: none;
  cursor: pointer;
  background: transparent;
}

input:disabled {
  cursor: not-allowed;
}

input::-webkit-slider-runnable-track {
  height: 4px;
  background: linear-gradient(to right, var(--accent) var(--fill), var(--surface-3) var(--fill));
  border-radius: 2px;
}

input::-webkit-slider-thumb {
  width: 14px;
  height: 14px;
  margin-top: -5px;
  appearance: none;
  background: var(--text);
  border: 0;
  border-radius: 50%;
  box-shadow: 0 0 0 3px var(--surface-1);
  transition: transform var(--fast) var(--ease);
}

input:hover:not(:disabled)::-webkit-slider-thumb {
  transform: scale(1.15);
}

input::-moz-range-track {
  height: 4px;
  background: var(--surface-3);
  border-radius: 2px;
}

input::-moz-range-progress {
  height: 4px;
  background: var(--accent);
  border-radius: 2px;
}

input::-moz-range-thumb {
  width: 14px;
  height: 14px;
  background: var(--text);
  border: 0;
  border-radius: 50%;
}

input:focus-visible {
  box-shadow: none;
}

input:focus-visible::-webkit-slider-thumb {
  box-shadow: var(--focus);
}
</style>
