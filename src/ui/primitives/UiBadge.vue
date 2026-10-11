<script setup lang="ts">
// A badge says what state something is in. It never is a button.
defineProps<{
  tone?: "neutral" | "ok" | "warn" | "danger" | "accent" | "air";
  /** A status light before the text. */
  dot?: boolean;
}>();
</script>

<template>
  <span class="badge" :class="tone ?? 'neutral'"><i v-if="dot" class="dot" aria-hidden="true" /><slot /></span>
</template>

<style scoped>
.badge {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  height: 20px;
  padding: 0 8px;
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--text-muted);
  white-space: nowrap;
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 10px;
}

.dot {
  width: 6px;
  height: 6px;
  background: currentColor;
  border-radius: 50%;
}

.ok {
  color: var(--ok);
}

.warn {
  color: var(--warn);
}

.danger {
  color: var(--danger);
}

.accent {
  color: var(--accent);
}

.air {
  color: var(--text-on-fill);
  background: var(--air-fill);
  border-color: transparent;
}

.air .dot {
  animation: blink 1.2s steps(2, jump-none) infinite;
}

@keyframes blink {
  50% {
    opacity: 0.35;
  }
}

@media (prefers-reduced-motion: reduce) {
  .air .dot {
    animation: none;
  }
}
</style>
