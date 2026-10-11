<script setup lang="ts">
// The console: a status bar, three panels in the order the signal flows, and the dock below them.
import ChainPanel from "../chain/ChainPanel.vue";
import Dock from "../dock/Dock.vue";
import OutputPanel from "../output/OutputPanel.vue";
import { useShortcuts } from "../shortcuts.ts";
import SourcePanel from "../source/SourcePanel.vue";
import ShortcutsDialog from "./ShortcutsDialog.vue";
import StatusLine from "./StatusLine.vue";
import Toasts from "./Toasts.vue";
import TopBar from "./TopBar.vue";

useShortcuts();
</script>

<template>
  <div class="shell">
    <TopBar />
    <main class="console">
      <SourcePanel class="at-source" />
      <ChainPanel class="at-chain" />
      <OutputPanel class="at-output" />
      <Dock class="at-dock" />
    </main>
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

/* Source over output in a rail, the chain beside them. */
@media (max-width: 1099px) {
  .console {
    grid-template-rows: auto auto auto;
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
    grid-template-columns: minmax(0, 1fr);
  }

  .at-source,
  .at-chain,
  .at-output {
    grid-row: auto;
    grid-column: 1;
  }
}
</style>
