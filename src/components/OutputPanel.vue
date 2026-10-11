<script setup lang="ts">
import { computed, ref } from "vue";
import { connectSdr, disconnectSdr, setGain, startRecording, startTx, stopRecording, stopTx } from "../engine/engine.ts";
import { webUsbAvailable } from "../sdr/device.ts";
import { FREQUENCY_PRESETS, radio } from "../state/radio.ts";
import { ui } from "../state/ui.ts";

const usbAvailable = webUsbAvailable();
const TX_LABELS = { off: "TX: DISABLED", starting: "TX: STARTING…", on: "TX: ON AIR", stopping: "TX: STOPPING…" };

const customFrequency = ref(false);
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

function switchSink() {
  if (!idle.value) void stopTx();
  if (radio.recording) stopRecording();
  radio.sink = radio.sink === "sdr" ? "disk" : "sdr";
}
</script>

<template>
  <section class="panel">
    <h2 class="bar">Output</h2>
    <div class="halves">
      <div class="half" :class="{ inactive: radio.sink !== 'sdr' }" :inert="radio.sink !== 'sdr'">
        <header class="half-head">
          <h3>SDR Transmitter</h3>
          <span class="readout" :class="radio.device ? 'good' : 'bad'">{{ radio.device?.name ?? "No SDR connected" }}</span>
        </header>
        <p v-if="!usbAvailable" class="hint bad">This browser has no WebUSB. Use Chrome, Edge or Brave on a computer.</p>
        <button v-else class="small" :disabled="radio.connecting || !idle" @click="radio.device ? disconnectSdr() : connectSdr()">
          {{ radio.device ? "Disconnect" : "Connect SDR…" }}
        </button>

        <div class="fields">
          <label>
            <span>Frequency:</span>
            <select v-model="preset" :disabled="!idle">
              <option v-for="each in FREQUENCY_PRESETS" :key="each.hz" :value="String(each.hz)">{{ each.label }}</option>
              <option value="custom">Custom…</option>
            </select>
          </label>
          <label v-if="customFrequency">
            <span>MHz:</span>
            <input v-model.number="frequencyMhz" type="number" step="0.001" min="1" :disabled="!idle" />
          </label>
          <label>
            <span>{{ gain?.label ?? "TX Power" }}:</span>
            <input
              type="range"
              :disabled="!gain"
              :min="gain?.min"
              :max="gain?.max"
              :step="gain?.step"
              :value="radio.gain"
              @input="setGain(Number(($event.target as HTMLInputElement).value))"
            />
            <output class="readout">{{ gain ? `${radio.gain.toFixed(2)} ${gain.unit}` : "-" }}</output>
          </label>
        </div>

        <button class="big" :class="idle ? 'idle' : 'air'" :disabled="!radio.device || !frequencyOk || radio.tx === 'starting' || radio.tx === 'stopping'" @click="idle ? startTx() : stopTx()">
          {{ TX_LABELS[radio.tx] }}
        </button>
        <p v-if="!frequencyOk" class="hint bad">This frequency is outside the range of the connected SDR.</p>
        <p class="notice">A valid amateur radio license is required to transmit on these frequencies. Verify your national band plan.</p>
      </div>

      <button class="switch" title="Switch between transmitting and saving to disk" @click="switchSink">&lt;|&gt;</button>

      <div class="half" :class="{ inactive: radio.sink !== 'disk' }" :inert="radio.sink !== 'disk'">
        <header class="half-head"><h3>Save to Disk</h3></header>
        <p class="hint">
          Saves raw IQ samples as complex64 binary. Two channels: I (real) and Q (imaginary). Compatible with GNU Radio, inspectrum, GQRX, and
          SDR# for offline analysis. Uses 16MB/sec, plan storage accordingly.
        </p>
        <button class="big" :class="radio.recording ? 'air' : 'go'" @click="radio.recording ? stopRecording() : startRecording()">
          {{ radio.recording ? `Stop & Save (${radio.recordedSeconds.toFixed(1)} s)` : "Record IQ" }}
        </button>
        <label class="check"><input v-model="ui.makeSpectrogram" type="checkbox" /> Generate Spectrogram Image</label>
      </div>
    </div>
  </section>
</template>
