<script setup lang="ts">
// The browser's own select, dressed like the other controls.
import UiIcon from "./UiIcon.vue";

defineProps<{ modelValue: string; label: string; disabled?: boolean; size?: "s" | "m" }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
</script>

<template>
  <span class="select" :class="[size ?? 'm', { disabled }]">
    <select :value="modelValue" :aria-label="label" :disabled="disabled" @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)">
      <slot />
    </select>
    <UiIcon name="chevronDown" :size="14" />
  </span>
</template>

<style scoped>
.select {
  position: relative;
  display: inline-flex;
  align-items: center;
  min-width: 0;
}

select {
  width: 100%;
  height: var(--control);
  padding: 0 26px 0 8px;
  font-size: var(--text-s);
  text-overflow: ellipsis;
  appearance: none;
  cursor: pointer;
  background: var(--surface-2);
  border: 1px solid var(--line-strong);
  border-radius: var(--r1);
  transition: border-color var(--fast) var(--ease);
}

.s select {
  height: var(--control-small);
}

select:hover:not(:disabled) {
  border-color: var(--control-border);
}

select:disabled {
  cursor: not-allowed;
}

.disabled {
  opacity: 0.45;
}

.icon {
  position: absolute;
  right: 7px;
  color: var(--text-muted);
  pointer-events: none;
}
</style>
