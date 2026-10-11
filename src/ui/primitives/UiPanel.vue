<script setup lang="ts">
// A titled region of the console. The title is a heading, so screen readers can jump between panels.
defineProps<{ title: string }>();
</script>

<template>
  <section class="panel" :aria-label="title">
    <header class="head">
      <h2 class="label">{{ title }}</h2>
      <div v-if="$slots.actions" class="actions"><slot name="actions" /></div>
    </header>
    <div class="body"><slot /></div>
  </section>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--surface-1);
  border: 1px solid var(--line);
  border-radius: var(--r2);
}

.head {
  display: flex;
  flex: none;
  gap: var(--s2);
  align-items: center;
  justify-content: space-between;
  min-height: 36px;
  padding: 0 var(--s2) 0 var(--s3);
  border-bottom: 1px solid var(--line);
}

.actions {
  display: flex;
  gap: var(--s1);
  align-items: center;
}

.body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
</style>
