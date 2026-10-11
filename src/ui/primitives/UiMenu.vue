<script setup lang="ts">
// A button that opens a list of actions. Arrow keys move through the items,
// Escape closes it and puts the focus back on the button.
import { nextTick, onBeforeUnmount, ref, watch } from "vue";
import type { IconName } from "../icons.ts";
import UiButton from "./UiButton.vue";

defineProps<{ label: string; icon?: IconName; size?: "s" | "m"; variant?: "default" | "ghost"; align?: "left" | "right" }>();

const open = ref(false);
const root = ref<HTMLElement>();
const list = ref<HTMLElement>();

const items = () => Array.from(list.value?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? []);

function close(refocus = true) {
  if (!open.value) return;
  open.value = false;
  if (refocus) root.value?.querySelector("button")?.focus();
}

function onKey(event: KeyboardEvent) {
  const all = items();
  const at = all.indexOf(document.activeElement as HTMLElement);
  if (event.key === "ArrowDown") all[(at + 1) % all.length]?.focus();
  else if (event.key === "ArrowUp") all[(at - 1 + all.length) % all.length]?.focus();
  else if (event.key === "Home") all[0]?.focus();
  else if (event.key === "End") all.at(-1)?.focus();
  else if (event.key === "Escape") close();
  else if (event.key === "Tab") return close(false);
  else return;
  event.preventDefault();
}

const outside = (event: PointerEvent) => !root.value?.contains(event.target as Node) && close(false);
watch(open, async (now) => {
  if (!now) return removeEventListener("pointerdown", outside, true);
  addEventListener("pointerdown", outside, true);
  await nextTick();
  items()[0]?.focus();
});
onBeforeUnmount(() => removeEventListener("pointerdown", outside, true));

defineExpose({ close });
</script>

<template>
  <div ref="root" class="menu">
    <UiButton :size="size" :variant="variant" :icon="icon" aria-haspopup="menu" :aria-expanded="open" @click="open = !open">{{ label }}</UiButton>
    <div v-if="open" ref="list" class="list" :class="align ?? 'left'" role="menu" :aria-label="label" @keydown="onKey">
      <slot :close="close" />
    </div>
  </div>
</template>

<style scoped>
.menu {
  position: relative;
  display: inline-flex;
}

.list {
  position: absolute;
  top: calc(100% + 4px);
  z-index: 5;
  min-width: 240px;
  max-height: min(420px, 70dvh);
  padding: var(--s1);
  overflow: auto;
  background: var(--surface-2);
  border-radius: var(--r2);
  box-shadow: var(--shadow-pop);
  animation: drop var(--fast) var(--ease);
}

.list.left {
  left: 0;
}

.list.right {
  right: 0;
}

@keyframes drop {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
}
</style>
