<script setup lang="ts">
// The line that is always in view: what is connected, on which frequency, and whether it transmits.
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { radio } from "../../state/radio.ts";
import { ui } from "../../state/ui.ts";
import { text } from "../../text.ts";
import UiBadge from "../primitives/UiBadge.vue";
import UiIcon from "../primitives/UiIcon.vue";

const t = text.output;
const live = computed(() => radio.tx !== "off");

/** MHz with the kilohertz and hertz set apart, like the display of a transceiver. */
const frequency = computed(() => {
  const hz = Math.round(radio.frequencyHz);
  const mhz = Math.floor(hz / 1e6);
  const rest = String(hz % 1e6).padStart(6, "0");
  return { mhz: mhz.toLocaleString("en-US").replace(/,/g, " "), khz: rest.slice(0, 3), hz: rest.slice(3) };
});

// Time on air, counted from the moment the transmitter is up.
const seconds = ref(0);
let timer: ReturnType<typeof setInterval> | undefined;
watch(
  () => radio.tx === "on",
  (on) => {
    clearInterval(timer);
    if (!on) return;
    const since = Date.now();
    seconds.value = 0;
    timer = setInterval(() => (seconds.value = Math.floor((Date.now() - since) / 1000)), 250);
  },
);
onBeforeUnmount(() => clearInterval(timer));
const elapsed = computed(() => `${String(Math.floor(seconds.value / 60)).padStart(2, "0")}:${String(seconds.value % 60).padStart(2, "0")}`);
</script>

<template>
  <header class="bar">
    <div class="brand">
      <span class="mark"><UiIcon name="zcp" :size="20" /></span>
      <h1>{{ text.app.name }}</h1>
    </div>

    <div class="center"><slot /></div>

    <div class="radio" :class="{ live }">
      <UiBadge :tone="radio.device ? 'ok' : 'neutral'" dot class="device">{{ radio.device?.name ?? t.noDevice }}</UiBadge>
      <output class="num frequency" :aria-label="t.frequency">
        {{ frequency.mhz }}<span class="point">.</span>{{ frequency.khz }}<span class="fine">&#8239;{{ frequency.hz }}</span><span class="unit">MHz</span>
      </output>
      <UiBadge :tone="live ? 'air' : 'neutral'" dot class="tx" role="status">
        {{ t.txState[radio.tx] }}<span v-if="radio.tx === 'on'" class="num elapsed">{{ elapsed }}</span>
      </UiBadge>
    </div>

    <div class="tools">
      <button type="button" class="tool" :title="text.app.shortcuts" :aria-label="text.app.shortcuts" @click="ui.shortcutsOpen = true">
        <UiIcon name="keyboard" />
      </button>
      <button type="button" class="tool" :title="text.app.theme[ui.theme]" :aria-label="text.app.theme[ui.theme]" @click="ui.theme = ui.theme === 'dark' ? 'light' : 'dark'">
        <UiIcon :name="ui.theme === 'dark' ? 'sun' : 'moon'" />
      </button>
    </div>
  </header>
</template>

<style scoped>
.bar {
  display: flex;
  flex: none;
  gap: var(--s4);
  align-items: center;
  height: 48px;
  padding: 0 var(--s3);
  background: var(--surface-1);
  border-bottom: 1px solid var(--line);
}

.brand {
  display: flex;
  gap: var(--s2);
  align-items: center;
  min-width: 0;
}

.mark {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  color: var(--accent);
  background: var(--accent-soft);
  border-radius: 6px;
}

h1 {
  font-size: var(--text-m);
  font-weight: 650;
  letter-spacing: 0.01em;
  white-space: nowrap;
}

.center {
  display: flex;
  flex: 1;
  align-items: center;
  min-width: 0;
}

.radio {
  display: flex;
  gap: var(--s3);
  align-items: center;
  min-width: 0;
}

.device {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.frequency {
  font-size: var(--text-xl);
  font-weight: 500;
  line-height: 1;
  letter-spacing: -0.01em;
  white-space: nowrap;
}

.live .frequency {
  color: var(--danger);
}

.point,
.fine {
  color: var(--text-faint);
}

.fine {
  font-size: var(--text-l);
}

.unit {
  margin-left: 6px;
  font: 600 var(--text-xs) var(--font-ui);
  letter-spacing: 0.06em;
  color: var(--text-faint);
}

.tx {
  min-width: 76px;
  justify-content: center;
}

.elapsed {
  margin-left: 2px;
  font-weight: 500;
}

.tools {
  display: flex;
  gap: 2px;
}

.tool {
  display: grid;
  place-items: center;
  width: var(--control);
  height: var(--control);
  color: var(--text-muted);
  background: none;
  border: 0;
  border-radius: var(--r1);
  transition:
    background var(--fast) var(--ease),
    color var(--fast) var(--ease);
}

.tool:hover {
  color: var(--text);
  background: var(--surface-3);
}

@media (max-width: 900px) {
  h1,
  .device {
    display: none;
  }
}

@media (max-width: 520px) {
  .frequency {
    font-size: var(--text-l);
  }

  .fine {
    display: none;
  }
}
</style>
