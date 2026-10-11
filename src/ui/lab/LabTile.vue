<script setup lang="ts">
// One configuration of the catalog: what it made of the utterance, and how that compares with the catalog.
import { computed } from "vue";
import { applyConfig, labResult } from "../../engine/engine.ts";
import { type LabEntry, lab } from "../../state/lab.ts";
import { ui } from "../../state/ui.ts";
import { text } from "../../text.ts";
import UiBadge from "../primitives/UiBadge.vue";
import UiIcon from "../primitives/UiIcon.vue";
import LabThumb from "./LabThumb.vue";

const props = defineProps<{ entry: LabEntry }>();
const t = text.lab;

const result = computed(() => labResult(props.entry));
const picked = computed(() => lab.picked.indexOf(props.entry.path));
const sameAs = computed(() => props.entry.sameAs?.split("/").at(-1));

/** Picks the entry for comparison, or lets it go. A third pick replaces the older of the two. */
function pick() {
  if (picked.value >= 0) lab.picked.splice(picked.value, 1);
  else lab.picked = [...lab.picked.slice(-1), props.entry.path];
}

function open() {
  applyConfig(props.entry.config);
  ui.workspace = "console";
}
</script>

<template>
  <article class="tile" :class="{ picked: picked >= 0, waiting: !result }">
    <button type="button" class="pick" :aria-pressed="picked >= 0" :aria-label="t.pick(entry.name)" :disabled="!result" @click="pick">
      <span class="image">
        <LabThumb v-if="result" :thumb="result.thumb" :columns="result.columns" :label="t.thumb(entry.name)" />
        <span v-else class="hint none">{{ t.notRun }}</span>
        <span v-if="picked >= 0" class="letter">{{ "AB"[picked] }}</span>
      </span>
      <span class="name num" :title="entry.name">{{ entry.name }}</span>
      <span class="numbers num">
        <template v-if="result">{{ result.pulses }} · {{ text.chain.percent(result.duty) }}</template>
        <template v-else>–</template>
      </span>
    </button>
    <footer class="foot">
      <UiBadge v-if="sameAs" :title="t.sameNote">{{ t.sameAs(sameAs) }}</UiBadge>
      <UiBadge v-else-if="result?.match === 'identical'" tone="ok" :title="t.identicalNote"><UiIcon name="check" :size="12" />{{ t.identical }}</UiBadge>
      <UiBadge v-else-if="result?.match === 'speech'" tone="accent" :title="t.speechNote">{{ t.speech }}</UiBadge>
      <UiBadge v-else-if="result?.match === 'different'" tone="danger" :title="t.differentNote">{{ t.different }}</UiBadge>
      <button type="button" class="open" :title="t.openNote" :aria-label="`${t.open}: ${entry.name}`" @click="open"><UiIcon name="sliders" :size="14" /></button>
    </footer>
  </article>
</template>

<style scoped>
.tile {
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--surface-1);
  border: 1px solid var(--line);
  border-radius: var(--r2);
  transition: border-color var(--fast) var(--ease);
}

.tile:hover {
  border-color: var(--line-strong);
}

.tile.picked {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}

.pick {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 2px var(--s2);
  padding: 0 0 var(--s1);
  text-align: left;
  background: none;
  border: 0;
  border-radius: var(--r2) var(--r2) 0 0;
}

.pick:disabled {
  cursor: default;
}

.image {
  position: relative;
  display: grid;
  grid-column: 1 / -1;
  place-items: center;
  height: 56px;
  margin-bottom: var(--s1);
  overflow: hidden;
  background: var(--plot-bg);
  border-radius: 7px 7px 0 0;
}

.none {
  font-size: var(--text-xs);
}

.letter {
  position: absolute;
  top: 4px;
  left: 4px;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  font-size: var(--text-xs);
  font-weight: 700;
  color: var(--text-on-fill);
  background: var(--accent-fill);
  border-radius: 50%;
}

.name {
  padding-left: var(--s2);
  overflow: hidden;
  font-size: var(--text-s);
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.numbers {
  padding-right: var(--s2);
  font-size: var(--text-xs);
  color: var(--text-muted);
  white-space: nowrap;
}

.foot {
  display: flex;
  gap: var(--s1);
  align-items: center;
  min-height: 28px;
  padding: 0 var(--s1) var(--s1) var(--s2);
}

.foot .badge {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.open {
  display: grid;
  flex: none;
  place-items: center;
  width: var(--control-small);
  height: var(--control-small);
  margin-left: auto;
  color: var(--text-faint);
  background: none;
  border: 0;
  border-radius: var(--r1);
}

.open:hover {
  color: var(--text);
  background: var(--surface-3);
}
</style>
