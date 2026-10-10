<script setup lang="ts">
import { computed, ref } from "vue";
import { connectSdr, disconnectSdr, setGain, startRecording, startTx, stopRecording, stopTx } from "../engine/engine.ts";
import { webUsbAvailable } from "../sdr/device.ts";
import { FREQUENCY_PRESETS, state } from "../state.ts";

const usbAvailable = webUsbAvailable();
const TX_LABELS = { off: "TX: DISABLED", starting: "TX: STARTING…", on: "TX: ON AIR", stopping: "TX: STOPPING…" };

const customFrequency = ref(false);
const preset = computed({
  get: () => (customFrequency.value ? "custom" : String(state.frequencyHz)),
  set(value) {
    customFrequency.value = value === "custom";
    if (value !== "custom") state.frequencyHz = Number(value);
  },
});
const frequencyMhz = computed({
  get: () => state.frequencyHz / 1e6,
  set: (mhz) => (state.frequencyHz = Math.round(mhz * 1e6)),
});
const frequencyOk = computed(() => {
  const range = state.device?.caps.frequency;
  return !range || (state.frequencyHz >= range.min && state.frequencyHz <= range.max);
});
const gain = computed(() => state.device?.caps.gain);
const idle = computed(() => state.tx === "off");

function switchSink() {
  if (!idle.value) void stopTx();
  if (state.recording) stopRecording();
  state.sink = state.sink === "sdr" ? "disk" : "sdr";
}
</script>

<template>
  <section class="panel">
    <h2 class="bar">Output</h2>
    <div class="halves">
      <div class="half" :class="{ inactive: state.sink !== 'sdr' }" :inert="state.sink !== 'sdr'">
        <header class="half-head">
          <h3>SDR Transmitter</h3>
          <span class="readout" :class="state.device ? 'good' : 'bad'">{{ state.device?.name ?? "No SDR connected" }}</span>
        </header>
        <p v-if="!usbAvailable" class="hint bad">This browser has no WebUSB. Use Chrome, Edge or Brave on a computer.</p>
        <button v-else class="small" :disabled="state.connecting || !idle" @click="state.device ? disconnectSdr() : connectSdr()">
          {{ state.device ? "Disconnect" : "Connect SDR…" }}
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
              :value="state.gain"
              @input="setGain(Number(($event.target as HTMLInputElement).value))"
            />
            <output class="readout">{{ gain ? `${state.gain.toFixed(2)} ${gain.unit}` : "-" }}</output>
          </label>
        </div>

        <button class="big" :class="idle ? 'idle' : 'air'" :disabled="!state.device || !frequencyOk || state.tx === 'starting' || state.tx === 'stopping'" @click="idle ? startTx() : stopTx()">
          {{ TX_LABELS[state.tx] }}
        </button>
        <p v-if="!frequencyOk" class="hint bad">This frequency is outside the range of the connected SDR.</p>
        <p class="notice">A valid amateur radio license is required to transmit on these frequencies. Verify your national band plan.</p>
      </div>

      <button class="switch" title="Switch between transmitting and saving to disk" @click="switchSink">&lt;|&gt;</button>

      <div class="half" :class="{ inactive: state.sink !== 'disk' }" :inert="state.sink !== 'disk'">
        <header class="half-head"><h3>Save to Disk</h3></header>
        <p class="hint">
          Saves raw IQ samples as complex64 binary. Two channels: I (real) and Q (imaginary). Compatible with GNU Radio, inspectrum, GQRX, and
          SDR# for offline analysis. Uses 16MB/sec, plan storage accordingly.
        </p>
        <button class="big" :class="state.recording ? 'air' : 'go'" @click="state.recording ? stopRecording() : startRecording()">
          {{ state.recording ? `Stop & Save (${state.recordedSeconds.toFixed(1)} s)` : "Record IQ" }}
        </button>
        <label class="check"><input v-model="state.makeSpectrogram" type="checkbox" /> Generate Spectrogram Image</label>
      </div>
    </div>
  </section>
</template>
