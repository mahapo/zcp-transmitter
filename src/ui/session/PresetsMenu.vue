<script setup lang="ts">
// Named settings of the chain: the two that are built in, the user's own, and a link that carries the set-up.
import { computed, ref } from "vue";
import { type ChainConfig, appDefaults, catalogBaseline } from "../../dsp/config.ts";
import { applyConfig, copyLink, deletePreset, saveCurrentAs } from "../../engine/engine.ts";
import { library } from "../../state/library.ts";
import { session } from "../../state/session.ts";
import { text } from "../../text.ts";
import UiButton from "../primitives/UiButton.vue";
import UiDialog from "../primitives/UiDialog.vue";
import UiIcon from "../primitives/UiIcon.vue";
import UiMenu from "../primitives/UiMenu.vue";
import UiMenuItem from "../primitives/UiMenuItem.vue";

const t = text.presets;
const builtIn = [
  { name: t.appDefaults, config: appDefaults() },
  { name: t.catalogBaseline, config: catalogBaseline() },
];

const current = computed(() => JSON.stringify(session.config));
const inEffect = (config: ChainConfig) => JSON.stringify(config) === current.value;

const saving = ref(false);
const name = ref("");
const exists = computed(() => library.presets.some((preset) => preset.name === name.value.trim()));

function save() {
  if (!name.value.trim()) return;
  saveCurrentAs(name.value);
  saving.value = false;
  name.value = "";
}
</script>

<template>
  <UiMenu :label="t.menu" icon="bookmark" size="s" variant="ghost" align="right">
    <template #default="{ close }">
      <p class="label group">{{ t.builtIn }}</p>
      <UiMenuItem v-for="preset in builtIn" :key="preset.name" :checked="inEffect(preset.config)" @click="(applyConfig(preset.config), close())">
        {{ preset.name }}
      </UiMenuItem>

      <p class="label group">{{ t.yours }}</p>
      <p v-if="library.presets.length === 0" class="hint none">{{ t.none }}</p>
      <div v-for="preset in library.presets" :key="preset.name" class="own">
        <UiMenuItem :checked="inEffect(preset.config)" @click="(applyConfig(preset.config), close())">{{ preset.name }}</UiMenuItem>
        <button type="button" class="remove" :title="t.remove(preset.name)" :aria-label="t.remove(preset.name)" @click="deletePreset(preset.name)">
          <UiIcon name="trash" :size="14" />
        </button>
      </div>

      <hr />
      <UiMenuItem icon="bookmark" @click="(close(false), (saving = true))">{{ t.save }}</UiMenuItem>
      <UiMenuItem icon="link" @click="(copyLink(), close())">{{ t.copyLink }}</UiMenuItem>
    </template>
  </UiMenu>

  <UiDialog :open="saving" :title="t.saveTitle" width="380px" @close="saving = false">
    <form id="save-preset" class="form" @submit.prevent="save">
      <label class="label" for="preset-name">{{ t.name }}</label>
      <input id="preset-name" v-model="name" class="name" maxlength="40" :placeholder="t.namePlaceholder" autocomplete="off" autofocus />
      <p class="hint replaces">{{ exists ? t.replaces : "" }}</p>
    </form>
    <template #actions>
      <UiButton @click="saving = false">{{ t.cancel }}</UiButton>
      <UiButton variant="primary" type="submit" form="save-preset" :disabled="!name.trim()">{{ t.confirm }}</UiButton>
    </template>
  </UiDialog>
</template>

<style scoped>
.group {
  padding: var(--s2) var(--s2) var(--s1);
}

.none {
  padding: 0 var(--s2) var(--s1);
}

.own {
  display: flex;
  align-items: center;
}

.own .item {
  flex: 1;
  min-width: 0;
}

.remove {
  display: grid;
  flex: none;
  place-items: center;
  width: var(--control);
  height: var(--control);
  color: var(--text-faint);
  background: none;
  border: 0;
  border-radius: var(--r1);
}

.remove:hover {
  color: var(--danger);
  background: var(--surface-3);
}

hr {
  height: 1px;
  margin: var(--s1) 0;
  background: var(--line);
  border: 0;
}

.form {
  display: flex;
  flex-direction: column;
  gap: var(--s2);
}

.name {
  height: 32px;
  padding: 0 10px;
  background: var(--plot-bg);
  border: 1px solid var(--line-strong);
  border-radius: var(--r1);
}

.name:focus-visible {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}

.replaces {
  min-height: 1.45em;
  color: var(--warn);
}
</style>
