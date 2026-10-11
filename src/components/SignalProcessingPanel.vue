<script setup lang="ts">
import { FILTERS, FILTER_GROUPS, type FilterKey, SLIDERS, appDefaults, canEnable, catalogBaseline, withFilter } from "../dsp/config.ts";
import { session } from "../state/session.ts";
import { signal } from "../state/signal.ts";
import SegmentMeter from "./SegmentMeter.vue";

const DUTY_FULL_SCALE = 0.1; // the meters top out at 10 %
const DUTY_ZONES: [number, number] = [0.4, 0.65];

const sliders = [
  { key: "pulseUs", label: "Pulse (µs)", unit: "µs" },
  { key: "hpfHz", label: "HPF (Hz)", unit: "Hz" },
  { key: "lpfHz", label: "LPF (Hz)", unit: "Hz" },
] as const;

const notes: Partial<Record<FilterKey, string>> = {
  deEmphasis: "Changes nothing, as in the original app: its GNU Radio filter ignores this setting.",
};

function toggle(key: FilterKey, event: Event) {
  session.config.filters = withFilter(session.config.filters, key, (event.target as HTMLInputElement).checked);
}

function blockedNote(key: FilterKey): string | undefined {
  return canEnable(session.config.filters, key) ? notes[key] : "The three noise filters cannot all run at once.";
}
</script>

<template>
  <section class="panel">
    <h2 class="bar">Signal Processing</h2>
    <div class="processing">
      <div class="controls">
        <label v-for="slider in sliders" :key="slider.key" class="slider">
          <span class="slider-name">{{ slider.label }}</span>
          <input v-model.number="session.config[slider.key]" type="range" v-bind="SLIDERS[slider.key]" />
          <output class="readout">{{ session.config[slider.key] }} {{ slider.unit }}</output>
        </label>

        <p class="caption">
          Optional Filters
          <span class="links">
            <button class="link" title="The app's starting point" @click="session.config = appDefaults()">Defaults</button>
            <button class="link" title="The baseline of the reference catalog" @click="session.config = catalogBaseline()">All off</button>
          </span>
        </p>
        <div class="filters">
          <fieldset v-for="group in FILTER_GROUPS" :key="group.id">
            <legend>{{ group.label }}</legend>
            <label v-for="filter in FILTERS.filter((each) => each.group === group.id)" :key="filter.key" class="check" :title="blockedNote(filter.key)">
              <input
                type="checkbox"
                :checked="session.config.filters[filter.key]"
                :disabled="!canEnable(session.config.filters, filter.key)"
                @change="toggle(filter.key, $event)"
              />
              {{ filter.label }}
            </label>
          </fieldset>
        </div>
      </div>

      <button class="duty" title="Click to reset the peak" @click="signal.dutyPeak = 0">
        <span class="duty-meters">
          <span class="duty-meter">
            <span class="duty-name">Live</span>
            <output>{{ (100 * signal.dutyLive).toFixed(1) }}%</output>
            <SegmentMeter vertical :value="signal.dutyLive / DUTY_FULL_SCALE" :segments="8" :zones="DUTY_ZONES" />
          </span>
          <span class="duty-meter">
            <span class="duty-name">Peak</span>
            <output>{{ (100 * signal.dutyPeak).toFixed(1) }}%</output>
            <SegmentMeter vertical :value="signal.dutyPeak / DUTY_FULL_SCALE" :segments="8" :zones="DUTY_ZONES" />
          </span>
        </span>
        <span class="duty-caption">Duty Cycle</span>
      </button>
    </div>
  </section>
</template>
