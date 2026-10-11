<script setup lang="ts" generic="T extends string">
// A choice of one among a few, all visible at once. Arrow keys move the choice, as in a radio group.
import type { IconName } from "../icons.ts";
import UiIcon from "./UiIcon.vue";

const props = defineProps<{
  modelValue: T;
  options: { value: T; label: string; icon?: IconName; title?: string }[];
  /** What is being chosen, for screen readers. */
  label: string;
  size?: "s" | "m";
  block?: boolean;
  disabled?: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [value: T] }>();

function move(event: KeyboardEvent, step: number) {
  const index = props.options.findIndex((option) => option.value === props.modelValue);
  const next = props.options[(index + step + props.options.length) % props.options.length];
  emit("update:modelValue", next.value);
  const buttons = (event.currentTarget as HTMLElement).parentElement!.querySelectorAll("button");
  buttons[props.options.indexOf(next)].focus();
}
</script>

<template>
  <div class="segmented" :class="[size ?? 'm', { block }]" role="radiogroup" :aria-label="label">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="option.value === modelValue"
      :tabindex="option.value === modelValue ? 0 : -1"
      :title="option.title"
      :disabled="disabled"
      @click="emit('update:modelValue', option.value)"
      @keydown.right.prevent="move($event, 1)"
      @keydown.down.prevent="move($event, 1)"
      @keydown.left.prevent="move($event, -1)"
      @keydown.up.prevent="move($event, -1)"
    >
      <UiIcon v-if="option.icon" :name="option.icon" :size="14" />
      {{ option.label }}
    </button>
  </div>
</template>

<style scoped>
.segmented {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 6px;
}

.block {
  display: flex;
}

.block button {
  flex: 1;
}

button {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  justify-content: center;
  height: 24px;
  padding: 0 10px;
  font-size: var(--text-s);
  font-weight: 500;
  color: var(--text-muted);
  white-space: nowrap;
  background: transparent;
  border: 0;
  border-radius: var(--r1);
  transition:
    background var(--fast) var(--ease),
    color var(--fast) var(--ease);
}

.s button {
  height: 20px;
  padding: 0 8px;
  font-size: var(--text-xs);
}

button:hover:not(:disabled) {
  color: var(--text);
}

button[aria-checked="true"] {
  color: var(--text);
  background: var(--surface-3);
  box-shadow: inset 0 0 0 1px var(--line-strong);
}

button:disabled {
  opacity: 0.45;
}
</style>
