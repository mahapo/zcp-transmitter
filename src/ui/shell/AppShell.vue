<script setup lang="ts">
// The console: a status bar, three panels in the order the signal flows, and the dock below them.
import ChainPanel from "../chain/ChainPanel.vue";
import { ui } from "../../state/ui.ts";
import { text } from "../../text.ts";
import Dock from "../dock/Dock.vue";
import LabWorkspace from "../lab/LabWorkspace.vue";
import OutputPanel from "../output/OutputPanel.vue";
import UiSegmented from "../primitives/UiSegmented.vue";
import { useShortcuts } from "../shortcuts.ts";
import SourcePanel from "../source/SourcePanel.vue";
import ShortcutsDialog from "./ShortcutsDialog.vue";
import StatusLine from "./StatusLine.vue";
import Toasts from "./Toasts.vue";
import TopBar from "./TopBar.vue";

useShortcuts();

const workspaces = [
  { value: "console" as const, label: text.lab.console, icon: "sliders" as const },
  { value: "lab" as const, label: text.lab.name, icon: "flask" as const },
];
</script>

<template>
  <div class="shell">
    <TopBar>
      <UiSegmented v-model="ui.workspace" :options="workspaces" :label="text.lab.workspace" />
    </TopBar>
    <main v-show="ui.workspace === 'console'" class="console">
      <SourcePanel class="at-source" />
      <ChainPanel class="at-chain" />
      <OutputPanel class="at-output" />
      <Dock class="at-dock" />
    </main>
    <LabWorkspace v-if="ui.workspace === 'lab'" />
    <StatusLine />
    <Toasts />
    <ShortcutsDialog />
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  flex-direction: column;
  height: 100dvh;
}

.console {
  display: grid;
  flex: 1;
  grid-template-rows: minmax(470px, 1fr) auto;
  grid-template-columns: 320px minmax(0, 1fr) 340px;
  gap: var(--s2);
  min-height: 0;
  padding: var(--s2);
  overflow: auto;
}

.at-dock {
  grid-column: 1 / -1;
}

@media (max-width: 1439px) {
  .console {
    grid-template-columns: 280px minmax(0, 1fr) 300px;
  }
}

/* Source over output in a rail, the chain beside them. Every panel is as tall as it needs and the page scrolls. */
@media (max-width: 1099px) {
  .console {
    grid-template-rows: max-content max-content auto;
    grid-template-columns: 300px minmax(0, 1fr);
  }

  .at-source {
    grid-row: 1;
    grid-column: 1;
  }

  .at-output {
    grid-row: 2;
    grid-column: 1;
  }

  .at-chain {
    grid-row: 1 / 3;
    grid-column: 2;
  }
}

/* One column, in the order the signal flows. */
@media (max-width: 759px) {
  .console {
    grid-template-rows: none;
    grid-template-columns: minmax(0, 1fr);
    grid-auto-rows: max-content;
  }

  .at-source,
  .at-chain,
  .at-output {
    grid-row: auto;
    grid-column: 1;
  }
}
</style>
