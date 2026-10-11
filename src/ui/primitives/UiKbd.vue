<template>
  <kbd class="kbd"><slot /></kbd>
</template>

<style scoped>
.kbd {
  display: inline-grid;
  place-items: center;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  font: 500 var(--text-xs) var(--font-mono);
  color: var(--text-muted);
  background: var(--surface-2);
  border: 1px solid var(--line-strong);
  border-bottom-width: 2px;
  border-radius: var(--r1);
}
</style>
