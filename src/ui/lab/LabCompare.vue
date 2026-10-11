<script setup lang="ts">
// Two configurations side by side: their waterfalls over the same time axis and how their pulses differ.
import { computed } from "vue";
import { compareOnsets } from "../../dsp/compare.ts";
import { AUDIO_RATE } from "../../dsp/config.ts";
import { labResult } from "../../engine/engine.ts";
import { LAB_ENTRIES, lab } from "../../state/lab.ts";
import { text } from "../../text.ts";
import LabThumb from "./LabThumb.vue";

// How far apart two pulses may be and still be the same one, and how far a
// whole train may be shifted: the F1 band-pass alone delays by 12 ms.
const TOLERANCE_SAMPLES = 1;
const MAX_LAG_SAMPLES = AUDIO_RATE / 20;
const t = text.lab;

const pair = computed(() =>
  lab.picked.flatMap((path) => {
    const entry = LAB_ENTRIES.find((each) => each.path === path);
    const result = entry && labResult(entry);
    return entry && result ? [{ entry, result }] : [];
  }),
);
/** Where the pulses begin: every other edge. */
const onsets = (edges: Uint32Array) => edges.filter((_, index) => index % 2 === 0);
const difference = computed(() => {
  if (pair.value.length < 2) return undefined;
  const [a, b] = pair.value;
  return compareOnsets(onsets(a.result.edges), onsets(b.result.edges), TOLERANCE_SAMPLES, MAX_LAG_SAMPLES);
});
const shift = computed(() => {
  const lag = difference.value?.lag ?? 0;
  return `${lag > 0 ? "+" : ""}${t.samples(lag)} (${((lag / AUDIO_RATE) * 1000).toFixed(1)} ms)`;
});
</script>

<template>
  <section class="compare" :aria-label="t.compare">
    <p v-if="pair.length < 2" class="hint">{{ t.pickTwo }}</p>
    <template v-else>
      <div class="pictures">
        <div v-for="(each, index) in pair" :key="each.entry.path" class="picture">
          <span class="letter">{{ "AB"[index] }}</span>
          <LabThumb :thumb="each.result.thumb" :columns="each.result.columns" :label="t.thumb(each.entry.name)" />
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <td />
            <th v-for="(each, index) in pair" :key="each.entry.path" scope="col" class="num" :title="each.entry.name">{{ "AB"[index] }} · {{ each.entry.name }}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">{{ t.crossings }}</th>
            <td v-for="each in pair" :key="each.entry.path" class="num">{{ each.result.crossings }}</td>
          </tr>
          <tr>
            <th scope="row">{{ t.pulses }}</th>
            <td v-for="each in pair" :key="each.entry.path" class="num">{{ each.result.pulses }}</td>
          </tr>
          <tr>
            <th scope="row">{{ t.duty }}</th>
            <td v-for="each in pair" :key="each.entry.path" class="num">{{ text.chain.percent(each.result.duty) }}</td>
          </tr>
        </tbody>
      </table>
      <dl v-if="difference" class="facts">
        <div>
          <dt>{{ t.matched }}</dt>
          <dd class="num">{{ difference.matched }}</dd>
        </div>
        <div>
          <dt>{{ t.only("A") }}</dt>
          <dd class="num">{{ difference.onlyA }}</dd>
        </div>
        <div>
          <dt>{{ t.only("B") }}</dt>
          <dd class="num">{{ difference.onlyB }}</dd>
        </div>
        <div>
          <dt>{{ t.lag }}</dt>
          <dd class="num">{{ shift }}</dd>
        </div>
      </dl>
    </template>
  </section>
</template>

<style scoped>
.compare {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) auto;
  gap: var(--s4);
  align-items: center;
  min-height: 132px;
  padding: var(--s3);
  background: var(--surface-1);
  border: 1px solid var(--line);
  border-radius: var(--r2);
}

.compare > .hint {
  grid-column: 1 / -1;
  text-align: center;
}

.pictures {
  display: grid;
  gap: 2px;
}

.picture {
  position: relative;
  height: 52px;
  overflow: hidden;
  border-radius: var(--r1);
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

table {
  font-size: var(--text-s);
  border-collapse: collapse;
}

th,
td {
  padding: 3px var(--s2);
  text-align: right;
  white-space: nowrap;
}

thead th {
  max-width: 180px;
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
}

tbody th {
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--text-faint);
  text-align: left;
  text-transform: uppercase;
}

.facts {
  display: grid;
  gap: 3px;
  margin: 0;
  font-size: var(--text-s);
}

.facts div {
  display: flex;
  gap: var(--s4);
  justify-content: space-between;
}

dt {
  color: var(--text-muted);
}

dd {
  margin: 0;
}

@media (max-width: 1099px) {
  .compare {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
