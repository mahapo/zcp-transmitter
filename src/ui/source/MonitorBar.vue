<script setup lang="ts">
// Listening to the take, or to the microphone's chain while it runs.
import { computed } from "vue";
import { canMonitor, toggleMonitor } from "../../engine/engine.ts";
import { session } from "../../state/session.ts";
import { signal } from "../../state/signal.ts";
import { ui } from "../../state/ui.ts";
import { text } from "../../text.ts";
import UiButton from "../primitives/UiButton.vue";
import UiCheck from "../primitives/UiCheck.vue";
import UiSegmented from "../primitives/UiSegmented.vue";
import UiSlider from "../primitives/UiSlider.vue";

const t = text.monitor;
const sources = [
  { value: "input" as const, label: t.input },
  { value: "tap" as const, label: t.tap, title: t.tapNote },
  { value: "pulses" as const, label: t.pulses },
];
// A dependency on the take and the source, so the button follows them.
const available = computed(() => (signal.take, ui.monitorSource, signal.stage, canMonitor()));
</script>

<template>
  <section class="monitor" :aria-label="t.title">
    <h3 class="label">{{ t.title }}</h3>
    <div class="row">
      <UiButton v-if="session.source === 'tts'" :icon="signal.monitoring ? 'square' : 'volume'" :disabled="!available" @click="toggleMonitor">
        {{ signal.monitoring ? t.stop : t.play }}
      </UiButton>
      <UiSegmented v-model="ui.monitorSource" :options="sources" :label="t.source" size="s" class="which" />
    </div>
    <template v-if="session.source === 'mic'">
      <UiCheck v-model="ui.monitorLive">{{ t.live }}</UiCheck>
      <p v-if="ui.monitorLive" class="hint">{{ t.liveHint }}</p>
    </template>
    <UiSlider v-model="ui.monitorVolume" :min="0" :max="1" :step="0.05" :label="t.volume" :readout="t.percent(ui.monitorVolume)" />
  </section>
</template>

<style scoped>
.monitor {
  display: flex;
  flex-direction: column;
  gap: var(--s2);
  padding-top: var(--s3);
  margin-top: auto;
  border-top: 1px solid var(--line);
  --slider-label: 4em;
  --slider-value: 3.6em;
}

.row {
  display: flex;
  gap: var(--s2);
  align-items: center;
  justify-content: space-between;
}

.which {
  margin-left: auto;
}
</style>
