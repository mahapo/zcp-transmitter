<script setup lang="ts">
// The optional filters in the three groups of the original app.
import { computed } from "vue";
import { FILTERS, FILTER_GROUPS, type FilterKey, canEnable } from "../../dsp/config.ts";
import { setFilter } from "../../engine/settings.ts";
import { session } from "../../state/session.ts";
import { text } from "../../text.ts";
import UiCheck from "../primitives/UiCheck.vue";

const t = text.chain;

const groups = computed(() =>
  FILTER_GROUPS.map((group) => ({ ...group, label: t.groups[group.id], filters: FILTERS.filter((filter) => filter.group === group.id) })),
);

function note(key: FilterKey): string | undefined {
  if (!canEnable(session.config.filters, key)) return t.noiseBlocked;
  return key === "deEmphasis" ? t.deEmphasisNote : undefined;
}
</script>

<template>
  <div class="filters">
    <fieldset v-for="group in groups" :key="group.id" :class="group.id">
      <legend>
        <i class="mark" aria-hidden="true" />{{ group.label }}
        <span v-if="group.id === 'noise'" class="limit">{{ t.noiseLimit }}</span>
      </legend>
      <UiCheck
        v-for="filter in group.filters"
        :key="filter.key"
        :model-value="session.config.filters[filter.key]"
        :disabled="!canEnable(session.config.filters, filter.key)"
        :note="note(filter.key)"
        @update:model-value="setFilter(filter.key, $event)"
      >
        {{ filter.label }}
        <span v-if="filter.key === 'deEmphasis'" class="tag">{{ t.noEffect }}</span>
      </UiCheck>
    </fieldset>
  </div>
</template>

<style scoped>
.filters {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: var(--s3) var(--s4);
}

fieldset {
  min-width: 0;
  padding: 0;
  margin: 0;
  border: 0;
}

legend {
  display: flex;
  gap: var(--s2);
  align-items: center;
  width: 100%;
  padding: 0 0 var(--s1);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  text-transform: uppercase;
}

.mark {
  width: 8px;
  height: 8px;
  border-radius: 2px;
}

.conditioning .mark {
  background: var(--group-conditioning);
}

.noise .mark {
  background: var(--group-noise);
}

.shaping .mark {
  background: var(--group-shaping);
}

.limit,
.tag {
  font-size: var(--text-xs);
  font-weight: 500;
  letter-spacing: 0;
  color: var(--text-faint);
  text-transform: none;
}

.tag {
  margin-left: var(--s1);
  padding: 0 5px;
  border: 1px solid var(--line-strong);
  border-radius: 8px;
}
</style>
