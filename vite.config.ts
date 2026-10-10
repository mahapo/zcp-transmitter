import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Relative asset URLs, so dist/ works under any GitHub Pages path.
  base: "./",
  plugins: [vue()],
  worker: { format: "es" },
  test: { include: ["tests/**/*.test.ts"], testTimeout: 120_000 },
});
