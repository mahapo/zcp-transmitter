<script setup lang="ts">
// One action of a UiMenu. `checked` marks the item that is in effect.
import type { IconName } from "../icons.ts";
import UiIcon from "./UiIcon.vue";

defineProps<{ icon?: IconName; checked?: boolean; disabled?: boolean }>();
</script>

<template>
  <button type="button" class="item" role="menuitem" :disabled="disabled">
    <span class="lead"><UiIcon v-if="checked" name="check" :size="14" /><UiIcon v-else-if="icon" :name="icon" :size="14" /></span>
    <span class="text"><slot /></span>
  </button>
</template>

<style scoped>
.item {
  display: flex;
  gap: var(--s2);
  align-items: center;
  width: 100%;
  min-height: var(--control);
  padding: 0 var(--s2);
  font-size: var(--text-s);
  text-align: left;
  background: none;
  border: 0;
  border-radius: var(--r1);
}

.item:hover:not(:disabled),
.item:focus-visible {
  background: var(--surface-3);
  box-shadow: none;
}

.item:focus-visible {
  outline: 1px solid var(--accent);
  outline-offset: -1px;
}

.item:disabled {
  color: var(--text-faint);
}

.lead {
  display: grid;
  flex: none;
  place-items: center;
  width: 14px;
  color: var(--text-muted);
}

.text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
