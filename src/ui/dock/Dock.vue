<script setup lang="ts">
// The strip along the bottom that shows the signal over time. Its height can be dragged.
import { ui } from "../../state/ui.ts";
import { text } from "../../text.ts";
import WaterfallView from "./WaterfallView.vue";

const MIN_HEIGHT = 160;
const KEY_STEP = 24;
const t = text.dock;

const maxHeight = () => Math.max(MIN_HEIGHT, Math.round(innerHeight * 0.6));
const clamp = (height: number) => Math.max(MIN_HEIGHT, Math.min(maxHeight(), Math.round(height)));

function drag(event: PointerEvent) {
  const handle = event.currentTarget as HTMLElement;
  const startY = event.clientY;
  const startHeight = ui.dockHeight;
  handle.setPointerCapture(event.pointerId);
  const move = (moved: PointerEvent) => (ui.dockHeight = clamp(startHeight + startY - moved.clientY));
  const done = () => {
    handle.removeEventListener("pointermove", move);
    handle.removeEventListener("pointerup", done);
    handle.removeEventListener("pointercancel", done);
  };
  handle.addEventListener("pointermove", move);
  handle.addEventListener("pointerup", done);
  handle.addEventListener("pointercancel", done);
}
</script>

<template>
  <section class="dock" :style="{ height: `${ui.dockHeight}px` }" :aria-label="t.tabs">
    <div
      class="handle"
      role="separator"
      aria-orientation="horizontal"
      tabindex="0"
      :aria-label="t.resize"
      :aria-valuenow="ui.dockHeight"
      :aria-valuemin="MIN_HEIGHT"
      :aria-valuemax="maxHeight()"
      @pointerdown.prevent="drag"
      @keydown.up.prevent="ui.dockHeight = clamp(ui.dockHeight + KEY_STEP)"
      @keydown.down.prevent="ui.dockHeight = clamp(ui.dockHeight - KEY_STEP)"
    />
    <header class="head">
      <h2 class="label">{{ t.waterfall }}</h2>
      <div id="dock-tools" class="tools" />
    </header>
    <div class="body">
      <WaterfallView />
    </div>
  </section>
</template>

<style scoped>
.dock {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--surface-1);
  border: 1px solid var(--line);
  border-radius: var(--r2);
}

.handle {
  position: absolute;
  top: -6px;
  right: 0;
  left: 0;
  z-index: 1;
  height: 10px;
  cursor: row-resize;
  touch-action: none;
}

.handle::after {
  position: absolute;
  top: 4px;
  left: calc(50% - 20px);
  width: 40px;
  height: 3px;
  content: "";
  background: var(--line-strong);
  border-radius: 2px;
  opacity: 0;
  transition: opacity var(--fast) var(--ease);
}

.handle:hover::after,
.handle:focus-visible::after {
  opacity: 1;
}

.handle:focus-visible {
  box-shadow: none;
}

.handle:focus-visible::after {
  background: var(--accent);
}

.head {
  display: flex;
  flex: none;
  gap: var(--s3);
  align-items: center;
  min-height: 36px;
  padding: 0 var(--s2) 0 var(--s3);
  border-bottom: 1px solid var(--line);
}

.tools {
  display: flex;
  flex: 1;
  gap: var(--s2);
  align-items: center;
  justify-content: flex-end;
  min-width: 0;
}

.body {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  border-radius: 0 0 var(--r2) var(--r2);
}
</style>
