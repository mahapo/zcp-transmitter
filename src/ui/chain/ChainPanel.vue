<script setup lang="ts">
// The signal chain: its filters, the three sliders and what comes out.
import { SLIDERS } from "../../dsp/config.ts";
import { allFiltersOff, resetToDefaults } from "../../engine/settings.ts";
import { session } from "../../state/session.ts";
import { signal } from "../../state/signal.ts";
import { ui } from "../../state/ui.ts";
import { text } from "../../text.ts";
import UiButton from "../primitives/UiButton.vue";
import UiPanel from "../primitives/UiPanel.vue";
import UiSegmented from "../primitives/UiSegmented.vue";
import UiSlider from "../primitives/UiSlider.vue";
import DutyMeters from "./DutyMeters.vue";
import FilterList from "./FilterList.vue";
import Flowgraph from "./Flowgraph.vue";
import TapInspector from "./TapInspector.vue";

const t = text.chain;
const sliders = ["pulseUs", "hpfHz", "lpfHz"] as const;
const views = [
  { value: "flow" as const, label: t.flow, icon: "workflow" as const },
  { value: "list" as const, label: t.list, icon: "list" as const },
];
</script>

<template>
  <UiPanel :title="t.panel">
    <template #actions>
      <UiButton size="s" variant="ghost" :title="t.defaultsNote" @click="resetToDefaults">{{ t.defaults }}</UiButton>
      <UiButton size="s" variant="ghost" :title="t.allOffNote" @click="allFiltersOff">{{ t.allOff }}</UiButton>
      <UiSegmented v-model="ui.chainView" :options="views" :label="t.view" size="s" />
    </template>

    <div class="chain">
      <section class="block" :aria-label="t.filters">
        <Flowgraph v-if="ui.chainView === 'flow'" />
        <FilterList v-else />
      </section>

      <TapInspector />

      <div class="foot">
        <section class="sliders">
          <UiSlider
            v-for="key in sliders"
            :key="key"
            v-model="session.config[key]"
            v-bind="SLIDERS[key]"
            :label="t.sliders[key].label"
            :readout="t.sliders[key].readout(session.config[key])"
          />
        </section>
        <section class="meters">
          <DutyMeters />
          <div class="count">
            <span class="label">{{ t.pulses }}</span>
            <output class="num">{{ signal.pulses.toLocaleString("en-US") }}</output>
          </div>
        </section>
      </div>
    </div>
  </UiPanel>
</template>

<style scoped>
.chain {
  display: flex;
  flex-direction: column;
  height: 100%;
  container-type: inline-size;
}

.block {
  flex: none;
  padding: var(--s3);
  border-bottom: 1px solid var(--line);
}

.foot {
  flex: none;
  border-top: 1px solid var(--line);
}

.sliders {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--s1) var(--s5);
  padding: var(--s2) var(--s3);
  --slider-label: 2.6em;
  --slider-value: 4.6em;
}

.meters {
  display: flex;
  gap: var(--s5);
  align-items: center;
  padding: var(--s2) var(--s3);
  border-top: 1px solid var(--line);
}

.meters > :first-child {
  flex: 1;
}

.count {
  display: flex;
  gap: var(--s2);
  align-items: baseline;
}

.count output {
  min-width: 4ch;
  font-size: var(--text-s);
  text-align: right;
}

@container (max-width: 620px) {
  .sliders {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
