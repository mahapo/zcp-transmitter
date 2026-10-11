<script setup lang="ts">
// The Catalog Lab: the catalog's 74 configurations over one utterance, side by side.
import { computed } from "vue";
import { cancelLab, exportLab, labIqBytes, labResult, runLab } from "../../engine/engine.ts";
import { LAB_ENTRIES, LAB_FOLDERS, lab } from "../../state/lab.ts";
import { signal } from "../../state/signal.ts";
import { text } from "../../text.ts";
import UiButton from "../primitives/UiButton.vue";
import UiPanel from "../primitives/UiPanel.vue";
import UiSegmented from "../primitives/UiSegmented.vue";
import LabCompare from "./LabCompare.vue";
import LabTile from "./LabTile.vue";

const t = text.lab;
const sources = computed(() => [
  { value: "reference" as const, label: t.reference },
  { value: "take" as const, label: t.take, title: signal.take?.audio ? signal.take.title : t.noTake },
]);
const folders = computed(() => [
  { id: "all", label: t.all, count: LAB_ENTRIES.length },
  ...LAB_FOLDERS.map((folder) => ({ id: folder, label: folder, count: LAB_ENTRIES.filter((entry) => entry.folder === folder).length })),
]);
const shown = computed(() => LAB_ENTRIES.filter((entry) => lab.folder === "all" || entry.folder === lab.folder));
const finished = computed(() => Object.keys(lab.results).length > 0);
const tally = computed(() => {
  const counts = { identical: 0, speech: 0, different: 0 };
  for (const entry of LAB_ENTRIES) {
    const match = labResult(entry)?.match;
    if (match) counts[match]++;
  }
  return counts;
});
const megabytes = computed(() => (lab.done, labIqBytes() / 1e6));

// Without a take there is nothing but the reference sample to run over.
function setSource(source: "reference" | "take") {
  if (source === "take" && !signal.take?.audio) return;
  lab.source = source;
}
</script>

<template>
  <main class="lab">
    <UiPanel :title="t.name" class="side">
      <div class="controls">
        <p class="hint">{{ t.intro }}</p>

        <div class="group">
          <span class="label">{{ t.utterance }}</span>
          <UiSegmented :model-value="lab.source" :options="sources" :label="t.utterance" block :disabled="lab.running" @update:model-value="setSource" />
          <p v-if="lab.source === 'take' && signal.take?.audio" class="hint num">{{ signal.take.title }}</p>
        </div>

        <UiButton v-if="!lab.running" variant="go" size="l" block icon="play" @click="runLab">{{ t.run(LAB_ENTRIES.length) }}</UiButton>
        <UiButton v-else variant="air" size="l" block icon="square" @click="cancelLab">{{ t.cancel }}</UiButton>
        <div v-if="lab.running || finished" class="progress" role="progressbar" :aria-valuenow="lab.done" aria-valuemin="0" :aria-valuemax="lab.total" :aria-label="t.progress(lab.done, lab.total)">
          <i :style="{ width: `${lab.total ? (100 * lab.done) / lab.total : 0}%` }" />
        </div>

        <div v-if="finished" class="group">
          <span class="label">{{ t.against }}</span>
          <p v-if="lab.isReference" class="num tally">{{ t.tally(tally.identical, tally.speech, tally.different) }}</p>
          <p v-else class="hint">{{ t.notReference }}</p>
        </div>

        <nav class="group" :aria-label="t.folders">
          <span class="label">{{ t.folders }}</span>
          <button v-for="folder in folders" :key="folder.id" type="button" class="folder" :aria-current="lab.folder === folder.id || undefined" @click="lab.folder = folder.id">
            <span class="num">{{ folder.label }}</span><span class="num count">{{ folder.count }}</span>
          </button>
        </nav>

        <div v-if="finished" class="group export">
          <UiButton icon="archive" block :busy="lab.packing !== null" :disabled="lab.running || lab.packing !== null" @click="exportLab">
            {{ lab.packing ? t.packing(lab.packing.done, lab.packing.total) : t.export }}
          </UiButton>
          <p class="hint">{{ t.exportNote(megabytes) }}</p>
        </div>
      </div>
    </UiPanel>

    <div class="main">
      <LabCompare />
      <div class="tiles">
        <LabTile v-for="entry in shown" :key="entry.path" :entry="entry" />
      </div>
    </div>
  </main>
</template>

<style scoped>
.lab {
  display: grid;
  flex: 1;
  grid-template-columns: 300px minmax(0, 1fr);
  gap: var(--s2);
  min-height: 0;
  padding: var(--s2);
}

.controls {
  display: flex;
  flex-direction: column;
  gap: var(--s4);
  min-height: 100%;
  padding: var(--s3);
}

.group {
  display: flex;
  flex-direction: column;
  gap: var(--s2);
}

.export {
  padding-top: var(--s3);
  margin-top: auto;
  border-top: 1px solid var(--line);
}

.progress {
  height: 4px;
  margin-top: calc(-1 * var(--s2));
  overflow: hidden;
  background: var(--meter-off);
  border-radius: 2px;
}

.progress i {
  display: block;
  height: 100%;
  background: var(--ok);
  border-radius: 2px;
  transition: width var(--fast) linear;
}

.tally {
  font-size: var(--text-s);
}

.folder {
  display: flex;
  gap: var(--s2);
  align-items: center;
  justify-content: space-between;
  height: var(--control);
  padding: 0 var(--s2);
  margin: 0 calc(-1 * var(--s2));
  font-size: var(--text-s);
  color: var(--text-muted);
  text-align: left;
  background: none;
  border: 0;
  border-radius: var(--r1);
}

.folder:hover {
  color: var(--text);
  background: var(--surface-2);
}

.folder[aria-current] {
  color: var(--text);
  background: var(--surface-3);
}

.count {
  color: var(--text-faint);
}

.main {
  display: flex;
  flex-direction: column;
  gap: var(--s2);
  min-width: 0;
  min-height: 0;
}

.tiles {
  display: grid;
  flex: 1;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: var(--s2);
  align-content: start;
  min-height: 0;
  padding-right: 2px;
  overflow: auto;
}

@media (max-width: 899px) {
  .lab {
    grid-template-columns: minmax(0, 1fr);
    overflow: auto;
  }

  .tiles {
    overflow: visible;
  }
}
</style>
