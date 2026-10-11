<script setup lang="ts">
// What was played, newest first. Opening a take shows it with the settings it
// was made with; only "Play again" sends anything out.
import { computed } from "vue";
import { catalogLabel } from "../../dsp/config.ts";
import { clearHistory, forget, openFromHistory, pin, playFromHistory } from "../../engine/engine.ts";
import { library } from "../../state/library.ts";
import { text } from "../../text.ts";
import UiButton from "../primitives/UiButton.vue";
import UiIcon from "../primitives/UiIcon.vue";

const t = text.history;
const megabytes = computed(() => library.takes.reduce((sum, take) => sum + take.bytes, 0) / 1e6);
const when = new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" });
const settings = (take: (typeof library.takes)[number]) => `${catalogLabel(take.config.filters)} · ${take.config.pulseUs} µs · ${take.config.hpfHz} Hz · ${take.config.lpfHz} Hz`;
</script>

<template>
  <Teleport defer to="#dock-tools">
    <span v-if="library.takes.length" class="num kept">{{ t.kept(library.takes.length, megabytes) }}</span>
    <UiButton size="s" icon="trash" :disabled="!library.takes.some((take) => !take.pinned)" @click="clearHistory">{{ t.clear }}</UiButton>
  </Teleport>

  <div v-if="library.takes.length" class="history">
    <table>
      <thead>
        <tr>
          <th scope="col">{{ t.columns.title }}</th>
          <th scope="col">{{ t.columns.when }}</th>
          <th scope="col">{{ t.columns.settings }}</th>
          <th scope="col" class="number">{{ t.columns.length }}</th>
          <th scope="col" class="number">{{ t.columns.pulses }}</th>
          <th scope="col" class="number">{{ t.columns.duty }}</th>
          <th scope="col"><span class="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="take in library.takes" :key="take.id">
          <th scope="row">
            <button type="button" class="open" :title="t.open(take.title)" @click="openFromHistory(take.id)">
              <UiIcon v-if="take.pinned" name="pin" :size="12" />{{ take.title }}
            </button>
          </th>
          <td class="num">{{ when.format(take.created) }}</td>
          <td class="num settings" :title="settings(take)">{{ settings(take) }}</td>
          <td class="num number">{{ t.seconds(take.seconds) }}</td>
          <td class="num number">{{ take.pulses }}</td>
          <td class="num number">{{ text.chain.percent(take.duty) }}</td>
          <td class="actions">
            <button type="button" :title="t.playAgain" :aria-label="t.playAgain" @click="playFromHistory(take.id)"><UiIcon name="play" :size="14" /></button>
            <button type="button" :class="{ on: take.pinned }" :title="take.pinned ? t.unpin : t.pin" :aria-label="take.pinned ? t.unpin : t.pin" :aria-pressed="take.pinned" @click="pin(take.id, !take.pinned)">
              <UiIcon name="pin" :size="14" />
            </button>
            <button type="button" class="danger" :title="t.remove" :aria-label="t.remove" @click="forget(take.id)"><UiIcon name="trash" :size="14" /></button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
  <div v-else class="empty">
    <UiIcon name="history" :size="28" />
    <p>{{ library.historyAvailable ? t.empty : t.unavailable }}</p>
  </div>
</template>

<style scoped>
.kept {
  font-size: var(--text-xs);
  color: var(--text-faint);
}

.history {
  height: 100%;
  overflow: auto;
}

table {
  width: 100%;
  font-size: var(--text-s);
  border-collapse: collapse;
}

thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: var(--s2) var(--s3);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--text-faint);
  text-align: left;
  text-transform: uppercase;
  white-space: nowrap;
  background: var(--surface-1);
  border-bottom: 1px solid var(--line);
}

td,
tbody th {
  padding: 0 var(--s3);
  height: 32px;
  font-weight: 400;
  text-align: left;
  white-space: nowrap;
  border-bottom: 1px solid var(--line);
}

tbody tr:hover {
  background: var(--surface-2);
}

.number {
  text-align: right;
}

td.num {
  color: var(--text-muted);
}

.settings {
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.open {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  max-width: 260px;
  padding: 0;
  overflow: hidden;
  font-weight: 500;
  text-overflow: ellipsis;
  background: none;
  border: 0;
  border-radius: 2px;
}

.open:hover {
  color: var(--accent);
}

.actions {
  width: 1%;
  text-align: right;
}

.actions button {
  display: inline-grid;
  place-items: center;
  width: var(--control-small);
  height: var(--control-small);
  color: var(--text-faint);
  vertical-align: middle;
  background: none;
  border: 0;
  border-radius: var(--r1);
}

.actions button:hover {
  color: var(--text);
  background: var(--surface-3);
}

.actions button.on {
  color: var(--accent);
}

.actions button.danger:hover {
  color: var(--danger);
}

.empty {
  display: grid;
  place-content: center;
  place-items: center;
  gap: var(--s2);
  height: 100%;
  padding: var(--s4);
  color: var(--text-faint);
  text-align: center;
  background: var(--plot-bg);
}
</style>
