<script setup lang="ts">
// A button names an action. What state the app is in is said by a badge next to it.
import type { IconName } from "../icons.ts";
import UiIcon from "./UiIcon.vue";

defineProps<{
  /** go = start something, air = stop something that is live, primary = the main action of a dialog. */
  variant?: "default" | "primary" | "go" | "air" | "ghost";
  size?: "s" | "m" | "l";
  icon?: IconName;
  block?: boolean;
  /** Shows a spinner in place of the icon. */
  busy?: boolean;
}>();
</script>

<template>
  <button type="button" class="button" :class="[variant ?? 'default', size ?? 'm', { block, busy }]" :aria-busy="busy || undefined">
    <span v-if="busy" class="spinner" aria-hidden="true" />
    <UiIcon v-else-if="icon" :name="icon" :size="size === 'l' ? 18 : 14" />
    <span v-if="$slots.default" class="text"><slot /></span>
  </button>
</template>

<style scoped>
.button {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  justify-content: center;
  min-width: 0;
  height: var(--control);
  padding: 0 10px;
  font-size: var(--text-s);
  font-weight: 500;
  white-space: nowrap;
  background: var(--surface-2);
  border: 1px solid var(--line-strong);
  border-radius: var(--r1);
  transition:
    background var(--fast) var(--ease),
    border-color var(--fast) var(--ease),
    opacity var(--fast) var(--ease);
}

.button:hover:not(:disabled) {
  background: var(--surface-3);
  border-color: var(--control-border);
}

.button:active:not(:disabled) {
  transform: translateY(0.5px);
}

.button:disabled {
  opacity: 0.45;
}

.text {
  overflow: hidden;
  text-overflow: ellipsis;
}

.s {
  height: var(--control-small);
  padding: 0 8px;
}

.l {
  height: var(--control-big);
  padding: 0 16px;
  font-size: var(--text-m);
  font-weight: 600;
  letter-spacing: 0.01em;
}

.block {
  display: flex;
  width: 100%;
}

.primary,
.go,
.air {
  color: var(--text-on-fill);
  border-color: transparent;
}

.primary {
  background: var(--accent-fill);
}

.go {
  background: var(--ok-fill);
}

.air {
  background: var(--air-fill);
  box-shadow: 0 0 0 0 var(--air-glow);
  animation: live 1.6s var(--ease) infinite;
}

.primary:hover:not(:disabled),
.go:hover:not(:disabled),
.air:hover:not(:disabled) {
  border-color: transparent;
  filter: brightness(1.12);
}

.primary:hover:not(:disabled) {
  background: var(--accent-fill);
}

.go:hover:not(:disabled) {
  background: var(--ok-fill);
}

.air:hover:not(:disabled) {
  background: var(--air-fill);
}

.ghost {
  color: var(--text-muted);
  background: transparent;
  border-color: transparent;
}

.ghost:hover:not(:disabled) {
  color: var(--text);
  background: var(--surface-3);
  border-color: transparent;
}

.spinner {
  width: 12px;
  height: 12px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes live {
  50% {
    box-shadow: 0 0 0 5px transparent;
  }
}

@media (prefers-reduced-motion: reduce) {
  .air,
  .spinner {
    animation: none;
  }
}
</style>
