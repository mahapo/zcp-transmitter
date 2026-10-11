<script setup lang="ts">
// What the app last did, and the settings in the catalog's shorthand.
import { computed } from "vue";
import { catalogLabel } from "../../dsp/config.ts";
import { session } from "../../state/session.ts";
import { ui } from "../../state/ui.ts";
import { text } from "../../text.ts";
import UiIcon from "../primitives/UiIcon.vue";

const settings = computed(() => {
  const { filters, pulseUs, hpfHz, lpfHz } = session.config;
  return `${catalogLabel(filters)} · ${pulseUs} µs · ${hpfHz} Hz · ${lpfHz} Hz`;
});
</script>

<template>
  <footer class="status">
    <p class="message num" :class="{ bad: ui.failed }" role="status">
      <UiIcon v-if="ui.failed" name="warning" :size="14" />{{ ui.message || text.status.ready }}
    </p>
    <p class="settings num" :title="settings">{{ settings }}</p>
  </footer>
</template>

<style scoped>
.status {
  display: flex;
  flex: none;
  gap: var(--s4);
  align-items: center;
  justify-content: space-between;
  min-height: 28px;
  padding: 0 var(--s3);
  font-size: var(--text-xs);
  background: var(--surface-1);
  border-top: 1px solid var(--line);
}

.message {
  display: flex;
  gap: 6px;
  align-items: center;
  min-width: 0;
  color: var(--text-muted);
}

.message.bad {
  color: var(--danger);
}

.settings {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--text-faint);
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 760px) {
  .settings {
    display: none;
  }
}
</style>
