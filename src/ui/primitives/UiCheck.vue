<script setup lang="ts">
// A checkbox with its label. `note` explains it, or why it cannot be switched right now.
defineProps<{ modelValue: boolean; disabled?: boolean; note?: string }>();
const emit = defineEmits<{ "update:modelValue": [value: boolean] }>();
</script>

<template>
  <label class="check" :class="{ disabled }" :title="note">
    <input type="checkbox" :checked="modelValue" :disabled="disabled" @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)" />
    <span class="box" aria-hidden="true">
      <svg viewBox="0 0 12 12" width="12" height="12"><path d="M2.5 6.2 5 8.6 9.5 3.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </span>
    <span class="text"><slot /></span>
  </label>
</template>

<style scoped>
.check {
  position: relative;
  display: flex;
  gap: var(--s2);
  align-items: center;
  min-height: 24px;
  font-size: var(--text-s);
  cursor: pointer;
}

.disabled {
  color: var(--text-faint);
  cursor: not-allowed;
}

input {
  position: absolute;
  width: 16px;
  height: 16px;
  margin: 0;
  cursor: inherit;
  opacity: 0;
}

.box {
  display: grid;
  flex: none;
  place-items: center;
  width: 16px;
  height: 16px;
  color: transparent;
  background: var(--surface-2);
  border: 1px solid var(--control-border);
  border-radius: 3px;
  transition:
    background var(--fast) var(--ease),
    border-color var(--fast) var(--ease);
}

.check:hover input:not(:disabled) + .box {
  border-color: var(--accent);
}

input:checked + .box {
  color: var(--text-on-fill);
  background: var(--accent-fill);
  border-color: var(--accent-fill);
}

input:disabled + .box {
  opacity: 0.5;
}

input:focus-visible + .box {
  box-shadow: var(--focus);
}

.text {
  min-width: 0;
}
</style>
