<script setup lang="ts">
// Where the audio comes from: eSpeak, a file or the microphone.
import { computed, ref } from "vue";
import { MAX_TEXT_LENGTH, VOICES } from "../../audio/tts.ts";
import { generateVoice, playFile, playReferenceSample, toggleMic } from "../../engine/engine.ts";
import { session } from "../../state/session.ts";
import { signal } from "../../state/signal.ts";
import { text } from "../../text.ts";
import SegmentMeter from "../instruments/SegmentMeter.vue";
import UiBadge from "../primitives/UiBadge.vue";
import UiButton from "../primitives/UiButton.vue";
import UiPanel from "../primitives/UiPanel.vue";
import UiSegmented from "../primitives/UiSegmented.vue";
import UiSelect from "../primitives/UiSelect.vue";
import MonitorBar from "./MonitorBar.vue";

const MIC_FLOOR_DB = -60;
const t = text.source;

const sources = [
  { value: "tts" as const, label: t.tts, icon: "audioLines" as const },
  { value: "mic" as const, label: t.mic, icon: "mic" as const },
];
const micLevel = computed(() => 1 - signal.micDb / MIC_FLOOR_DB);
const filePicker = ref<HTMLInputElement>();

/** Leaving the microphone side mutes it. */
function setSource(source: "mic" | "tts") {
  if (source === session.source) return;
  if (signal.micOn) void toggleMic();
  session.source = source;
}

function onFile(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files?.[0]) void playFile(input.files[0]);
  input.value = "";
}
</script>

<template>
  <UiPanel :title="t.panel">
    <div class="source">
      <UiSegmented :model-value="session.source" :options="sources" :label="t.choose" block @update:model-value="setSource" />

      <div v-if="session.source === 'tts'" class="mode">
        <div class="row">
          <UiSelect v-model="session.voice" :label="t.voice" size="s">
            <option v-for="voice in VOICES" :key="voice.id" :value="voice.id">{{ voice.label }}</option>
          </UiSelect>
          <span class="num count" :class="{ full: session.text.length >= MAX_TEXT_LENGTH }">{{ session.text.length }}/{{ MAX_TEXT_LENGTH }}</span>
        </div>
        <textarea
          v-model="session.text"
          class="words"
          :maxlength="MAX_TEXT_LENGTH"
          rows="4"
          :aria-label="t.textLabel"
          spellcheck="false"
        />
        <UiButton variant="go" size="l" block icon="play" :busy="signal.generating" :disabled="signal.generating || !session.text.trim()" @click="generateVoice">
          {{ signal.generating ? t.generating : t.generate }}
        </UiButton>
        <div class="row others">
          <UiButton size="s" variant="ghost" icon="bookmark" :title="t.referenceSampleNote" @click="playReferenceSample">{{ t.referenceSample }}</UiButton>
          <UiButton size="s" variant="ghost" icon="upload" @click="filePicker?.click()">{{ t.audioFile }}</UiButton>
          <input ref="filePicker" type="file" accept="audio/*,.wav" hidden @change="onFile" />
        </div>
      </div>

      <div v-else class="mode">
        <div class="row">
          <UiBadge :tone="signal.micOn ? 'ok' : 'neutral'" dot>{{ signal.micOn ? t.micLive : t.micMuted }}</UiBadge>
          <output class="num level" :class="{ live: signal.micOn }">{{ t.decibel(signal.micDb) }}</output>
        </div>
        <div>
          <SegmentMeter :value="micLevel" :segments="30" :label="t.micLevel" :value-text="t.decibel(signal.micDb)" />
          <div class="scale num" aria-hidden="true"><span>-60</span><span>-30</span><span>0 dB</span></div>
        </div>
        <p class="hint">{{ t.micHint }}</p>
        <UiButton :variant="signal.micOn ? 'air' : 'go'" size="l" block icon="mic" @click="toggleMic">
          {{ signal.micOn ? t.mute : t.unmute }}
        </UiButton>
      </div>

      <MonitorBar />
    </div>
  </UiPanel>
</template>

<style scoped>
.source,
.mode {
  display: flex;
  flex-direction: column;
  gap: var(--s3);
}

.source {
  min-height: 100%;
  padding: var(--s3);
}

.row {
  display: flex;
  gap: var(--s2);
  align-items: center;
  justify-content: space-between;
}

.others {
  justify-content: flex-start;
  margin: calc(-1 * var(--s1)) calc(-1 * var(--s1)) 0;
}

.count {
  font-size: var(--text-xs);
  color: var(--text-faint);
}

.count.full {
  color: var(--warn);
}

.words {
  display: block;
  width: 100%;
  min-height: 72px;
  padding: var(--s2) 10px;
  font-size: var(--text-l);
  line-height: 1.4;
  resize: vertical;
  background: var(--plot-bg);
  border: 1px solid var(--line-strong);
  border-radius: var(--r1);
  transition: border-color var(--fast) var(--ease);
}

.words:hover {
  border-color: var(--control-border);
}

.words:focus-visible {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}

.level {
  font-size: var(--text-l);
  color: var(--text-faint);
}

.level.live {
  color: var(--ok);
}

.scale {
  display: flex;
  justify-content: space-between;
  margin-top: var(--s1);
  font-size: var(--text-xs);
  color: var(--text-faint);
}
</style>
