<script setup lang="ts">
import { computed, ref } from "vue";
import { MAX_TEXT_LENGTH, VOICES } from "../audio/tts.ts";
import { generateVoice, playFile, playReferenceSample, toggleMic } from "../engine/engine.ts";
import { state } from "../state.ts";
import SegmentMeter from "./SegmentMeter.vue";

const MIC_FLOOR_DB = -60;

const micLevel = computed(() => 1 - state.micDb / MIC_FLOOR_DB);
const filePicker = ref<HTMLInputElement>();

function switchSource() {
  if (state.micOn) void toggleMic();
  state.source = state.source === "mic" ? "tts" : "mic";
}

function onFile(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files?.[0]) void playFile(input.files[0]);
  input.value = "";
}
</script>

<template>
  <section class="panel">
    <h2 class="bar">Audio Input</h2>
    <div class="halves">
      <div class="half" :class="{ inactive: state.source !== 'mic' }" :inert="state.source !== 'mic'">
        <header class="half-head">
          <h3>Live Microphone</h3>
          <output class="readout good">{{ state.micDb.toFixed(1) }} dB</output>
        </header>
        <p class="hint">
          Mic Level: in silence -45 dB, aim for -18 dB when speaking. Adjust in your OS: System Settings &gt; Sound &gt; Input.
        </p>
        <SegmentMeter :value="micLevel" :segments="25" />
        <div class="scale"><span>-60</span><span>-30</span><span>0 dB</span></div>
        <button class="big" :class="state.micOn ? 'go' : 'idle'" @click="toggleMic">Mic: {{ state.micOn ? "LIVE" : "MUTED" }}</button>
      </div>

      <button class="switch" title="Switch between microphone and text to speech" @click="switchSource">&lt;|&gt;</button>

      <div class="half" :class="{ inactive: state.source !== 'tts' }" :inert="state.source !== 'tts'">
        <header class="half-head">
          <h3>eSpeak TTS</h3>
          <select v-model="state.voice" class="voice" title="eSpeak voice">
            <option v-for="voice in VOICES" :key="voice.id" :value="voice.id">{{ voice.label }}</option>
          </select>
          <span class="readout">{{ state.text.length }}/{{ MAX_TEXT_LENGTH }}</span>
        </header>
        <textarea v-model="state.text" :maxlength="MAX_TEXT_LENGTH" rows="3" aria-label="Text to speak" />
        <button class="big go" :disabled="state.generating || !state.text.trim()" @click="generateVoice">
          {{ state.generating ? "Generating…" : "Generate Voice" }}
        </button>
        <p class="links">
          <button class="link" title="The utterance the reference catalog was made from" @click="playReferenceSample">
            Reference sample
          </button>
          <button class="link" @click="filePicker?.click()">Audio file…</button>
          <input ref="filePicker" type="file" accept="audio/*,.wav" hidden @change="onFile" />
        </p>
      </div>
    </div>
  </section>
</template>
