<script setup lang="ts">
// Where the pulses go: to an SDR or into an IQ file.
import { computed, ref } from "vue";
import { connectSdr, disconnectSdr, setGain, startRecording, startTx, stopRecording, stopTx } from "../../engine/engine.ts";
import { webUsbAvailable } from "../../sdr/device.ts";
import { FREQUENCY_PRESETS, radio } from "../../state/radio.ts";
import { ui } from "../../state/ui.ts";
import { text } from "../../text.ts";
import UiBadge from "../primitives/UiBadge.vue";
import UiButton from "../primitives/UiButton.vue";
import UiCheck from "../primitives/UiCheck.vue";
import UiPanel from "../primitives/UiPanel.vue";
import UiSegmented from "../primitives/UiSegmented.vue";
import UiSelect from "../primitives/UiSelect.vue";
import UiSlider from "../primitives/UiSlider.vue";
import RxMonitor from "./RxMonitor.vue";

const t = text.output;
const usbAvailable = webUsbAvailable();
const sinks = [
  { value: "sdr" as const, label: t.sdr, icon: "radio" as const },
  { value: "disk" as const, label: t.disk, icon: "download" as const },
];

const customFrequency = ref(!FREQUENCY_PRESETS.some((preset) => preset.hz === radio.frequencyHz));
const preset = computed({
  get: () => (customFrequency.value ? "custom" : String(radio.frequencyHz)),
  set(value) {
    customFrequency.value = value === "custom";
    if (value !== "custom") radio.frequencyHz = Number(value);
  },
});
const frequencyMhz = computed({
  get: () => radio.frequencyHz / 1e6,
  set: (mhz) => (radio.frequencyHz = Math.round(mhz * 1e6)),
});
const frequencyOk = computed(() => {
  const range = radio.device?.caps.frequency;
  return !range || (radio.frequencyHz >= range.min && radio.frequencyHz <= range.max);
});
const gain = computed(() => radio.device?.caps.gain);
const idle = computed(() => radio.tx === "off");
const changing = computed(() => radio.tx === "starting" || radio.tx === "stopping");

/** Leaving a side stops what is running on it. */
function setSink(sink: "sdr" | "disk") {
  if (sink === radio.sink) return;
  if (!idle.value) void stopTx();
  if (radio.recording) stopRecording();
  radio.sink = sink;
}
</script>

<template>
  <UiPanel :title="t.panel">
    <div class="output">
      <UiSegmented :model-value="radio.sink" :options="sinks" :label="t.choose" block @update:model-value="setSink" />

      <div v-if="radio.sink === 'sdr'" class="mode">
        <div class="row">
          <UiBadge :tone="radio.device ? 'ok' : 'neutral'" dot class="device">{{ radio.device?.name ?? t.noDevice }}</UiBadge>
          <UiButton v-if="usbAvailable" size="s" icon="plug" :busy="radio.connecting" :disabled="radio.connecting || !idle" @click="radio.device ? disconnectSdr() : connectSdr()">
            {{ radio.device ? t.disconnect : t.connect }}
          </UiButton>
        </div>
        <p v-if="!usbAvailable" class="hint bad">{{ t.noWebUsb }}</p>

        <div class="fields">
          <label class="field">
            <span class="name">{{ t.frequency }}</span>
            <UiSelect v-model="preset" :label="t.frequency" :disabled="!idle">
              <option v-for="each in FREQUENCY_PRESETS" :key="each.hz" :value="String(each.hz)">{{ each.label }}</option>
              <option value="custom">{{ t.custom }}</option>
            </UiSelect>
          </label>
          <label v-if="customFrequency" class="field">
            <span class="name">{{ t.megahertz }}</span>
            <input v-model.number="frequencyMhz" class="number num" type="number" step="0.001" min="1" :disabled="!idle" :aria-invalid="!frequencyOk" />
          </label>
          <UiSlider
            :model-value="radio.gain"
            :min="gain?.min"
            :max="gain?.max"
            :step="gain?.step"
            :label="gain?.label ?? t.power"
            :readout="gain ? t.powerReadout(radio.gain, gain.unit) : t.none"
            :disabled="!gain"
            @update:model-value="setGain"
          />
        </div>

        <p v-if="!frequencyOk" class="hint bad" role="alert">{{ t.outOfRange }}</p>
        <UiButton
          :variant="idle ? 'go' : 'air'"
          size="l"
          block
          :icon="idle ? 'radio' : 'square'"
          :busy="changing"
          :disabled="!radio.device || !frequencyOk || changing"
          @click="idle ? startTx() : stopTx()"
        >
          {{ t.tx[radio.tx] }}
        </UiButton>
        <p class="notice">{{ t.licence }}</p>
        <RxMonitor />
      </div>

      <div v-else class="mode">
        <p class="hint">{{ t.diskHint }}</p>
        <UiButton :variant="radio.recording ? 'air' : 'go'" size="l" block :icon="radio.recording ? 'square' : 'circle'" @click="radio.recording ? stopRecording() : startRecording()">
          {{ radio.recording ? t.stopAndSave(radio.recordedSeconds) : t.record }}
        </UiButton>
        <UiCheck v-model="ui.makeSpectrogram">{{ t.makeSpectrogram }}</UiCheck>
      </div>

      <slot />
    </div>
  </UiPanel>
</template>

<style scoped>
.output,
.mode,
.fields {
  display: flex;
  flex-direction: column;
  gap: var(--s3);
}

.output {
  padding: var(--s3);
  --slider-label: 7.5em;
  --slider-value: 5.2em;
}

.fields {
  gap: var(--s2);
}

.row {
  display: flex;
  gap: var(--s2);
  align-items: center;
  justify-content: space-between;
}

.device {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.field {
  display: grid;
  grid-template-columns: 7.5em minmax(0, 1fr);
  gap: var(--s3);
  align-items: center;
}

.name {
  font-size: var(--text-s);
  font-weight: 600;
  color: var(--text-muted);
}

.number {
  width: 100%;
  height: var(--control);
  padding: 0 8px;
  font-size: var(--text-s);
  background: var(--surface-2);
  border: 1px solid var(--line-strong);
  border-radius: var(--r1);
}

.number[aria-invalid="true"] {
  border-color: var(--danger);
}

.number:disabled {
  opacity: 0.45;
}

.bad {
  color: var(--danger);
}

.notice {
  font-size: var(--text-xs);
  line-height: 1.45;
  color: var(--text-faint);
}
</style>
