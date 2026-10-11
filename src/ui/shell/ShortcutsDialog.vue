<script setup lang="ts">
import { ui } from "../../state/ui.ts";
import { text } from "../../text.ts";
import UiDialog from "../primitives/UiDialog.vue";
import UiKbd from "../primitives/UiKbd.vue";
import { SHORTCUTS } from "../shortcuts.ts";

const mac = /Mac|iPhone|iPad/.test(navigator.platform);
const shown = (key: string) => (key === "Mod" ? (mac ? "⌘" : "Ctrl") : key);
</script>

<template>
  <UiDialog :open="ui.shortcutsOpen" :title="text.app.shortcuts" width="420px" @close="ui.shortcutsOpen = false">
    <dl class="list">
      <div v-for="shortcut in SHORTCUTS" :key="shortcut.label" class="row">
        <dt>{{ shortcut.label }}</dt>
        <dd><UiKbd v-for="key in shortcut.keys" :key="key">{{ shown(key) }}</UiKbd></dd>
      </div>
    </dl>
    <p class="hint note">{{ text.shortcuts.noTx }}</p>
  </UiDialog>
</template>

<style scoped>
.list {
  display: grid;
  gap: 2px;
  margin: 0;
}

.row {
  display: flex;
  gap: var(--s3);
  align-items: center;
  justify-content: space-between;
  min-height: 30px;
  border-bottom: 1px solid var(--line);
}

dd {
  display: flex;
  gap: var(--s1);
  margin: 0;
}

.note {
  margin-top: var(--s3);
}
</style>
