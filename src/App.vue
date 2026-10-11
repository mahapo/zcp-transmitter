<script setup lang="ts">
import AudioInputPanel from "./components/AudioInputPanel.vue";
import OutputPanel from "./components/OutputPanel.vue";
import SignalProcessingPanel from "./components/SignalProcessingPanel.vue";
import SpectrogramView from "./components/SpectrogramView.vue";
import { signal } from "./state/signal.ts";
import { ui } from "./state/ui.ts";
</script>

<template>
  <main class="app">
    <AudioInputPanel />
    <SignalProcessingPanel />
    <OutputPanel />
    <p class="message" :class="{ bad: ui.failed }" role="status">{{ ui.message }}</p>
    <SpectrogramView v-if="signal.spectrogram" :title="signal.spectrogram.title" :data="signal.spectrogram.data" />
  </main>
</template>
