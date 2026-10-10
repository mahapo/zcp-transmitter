<script setup lang="ts">
import AudioInputPanel from "./components/AudioInputPanel.vue";
import OutputPanel from "./components/OutputPanel.vue";
import SignalProcessingPanel from "./components/SignalProcessingPanel.vue";
import SpectrogramView from "./components/SpectrogramView.vue";
import { state } from "./state.ts";
</script>

<template>
  <main class="app">
    <AudioInputPanel />
    <SignalProcessingPanel />
    <OutputPanel />
    <p class="message" :class="{ bad: state.failed }" role="status">{{ state.message }}</p>
    <SpectrogramView v-if="state.spectrogram" :title="state.spectrogram.title" :data="state.spectrogram.data" />
  </main>
</template>
