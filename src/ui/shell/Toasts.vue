<script setup lang="ts">
// Errors, kept on screen for a while: the status line moves on with the next action.
import { dismiss } from "../../engine/status.ts";
import { ui } from "../../state/ui.ts";
import { text } from "../../text.ts";
import UiIcon from "../primitives/UiIcon.vue";
</script>

<template>
  <TransitionGroup tag="div" name="toast" class="toasts" role="alert" aria-live="assertive">
    <div v-for="toast in ui.toasts" :key="toast.id" class="toast">
      <UiIcon name="warning" />
      <p>{{ toast.message }}</p>
      <button type="button" :aria-label="text.status.dismiss" @click="dismiss(toast.id)"><UiIcon name="x" :size="14" /></button>
    </div>
  </TransitionGroup>
</template>

<style scoped>
.toasts {
  position: fixed;
  right: var(--s4);
  bottom: 44px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: var(--s2);
  width: min(380px, calc(100vw - 32px));
  pointer-events: none;
}

.toast {
  display: flex;
  gap: var(--s2);
  align-items: flex-start;
  padding: 10px var(--s2) 10px var(--s3);
  font-size: var(--text-s);
  pointer-events: auto;
  background: var(--surface-2);
  border-left: 3px solid var(--danger);
  border-radius: var(--r1);
  box-shadow: var(--shadow-pop);
}

.toast > .icon {
  margin-top: 1px;
  color: var(--danger);
}

p {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

button {
  display: grid;
  flex: none;
  place-items: center;
  width: 20px;
  height: 20px;
  color: var(--text-faint);
  background: none;
  border: 0;
  border-radius: var(--r1);
}

button:hover {
  color: var(--text);
  background: var(--surface-3);
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity var(--slow) var(--ease),
    transform var(--slow) var(--ease);
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
