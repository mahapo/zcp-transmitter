<script setup lang="ts">
// A modal dialog on the browser's <dialog>: it traps focus, closes on Escape and gives focus back.
import { ref, watch } from "vue";
import UiIcon from "./UiIcon.vue";

const props = defineProps<{ open: boolean; title: string; width?: string }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement>();

watch(
  () => [props.open, dialog.value] as const,
  ([open, element]) => {
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  },
  { flush: "post", immediate: true },
);

/** A click on the backdrop lands on the dialog element itself. */
function onClick(event: MouseEvent) {
  if (event.target === dialog.value) emit("close");
}
</script>

<template>
  <dialog ref="dialog" class="dialog" :style="{ width: width ?? '480px' }" :aria-label="title" @close="emit('close')" @click="onClick">
    <header class="head">
      <h2>{{ title }}</h2>
      <button type="button" class="close" aria-label="Close" @click="emit('close')"><UiIcon name="x" /></button>
    </header>
    <div class="body"><slot /></div>
    <footer v-if="$slots.actions" class="actions"><slot name="actions" /></footer>
  </dialog>
</template>

<style scoped>
.dialog {
  max-width: calc(100vw - 32px);
  max-height: calc(100dvh - 32px);
  padding: 0;
  color: var(--text);
  background: var(--surface-1);
  border: 0;
  border-radius: var(--r2);
  box-shadow: var(--shadow-pop);
}

.dialog[open] {
  display: flex;
  flex-direction: column;
  animation: rise var(--slow) var(--ease);
}

.dialog::backdrop {
  background: rgb(0 0 0 / 0.55);
  backdrop-filter: blur(2px);
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--s3) var(--s3) var(--s3) var(--s4);
  border-bottom: 1px solid var(--line);
}

h2 {
  font-size: var(--text-l);
  font-weight: 600;
}

.close {
  display: grid;
  place-items: center;
  width: var(--control);
  height: var(--control);
  color: var(--text-muted);
  background: none;
  border: 0;
  border-radius: var(--r1);
}

.close:hover {
  color: var(--text);
  background: var(--surface-3);
}

.body {
  padding: var(--s4);
  overflow: auto;
}

.actions {
  display: flex;
  gap: var(--s2);
  justify-content: flex-end;
  padding: var(--s3) var(--s4);
  border-top: 1px solid var(--line);
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}
</style>
