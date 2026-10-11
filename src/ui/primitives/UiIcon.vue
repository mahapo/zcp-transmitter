<script setup lang="ts">
import { ICONS, type IconName } from "../icons.ts";

defineProps<{ name: IconName; size?: number }>();
</script>

<template>
  <!-- The markup comes from icons.ts, never from user input. -->
  <svg
    class="icon"
    :width="size ?? 16"
    :height="size ?? 16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    v-html="ICONS[name]"
  />
</template>

<style scoped>
.icon {
  flex: none;
}
</style>
