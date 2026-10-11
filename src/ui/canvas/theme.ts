// Canvases cannot use CSS variables, so they read the tokens here and redraw
// whenever `themeRevision` changes.
import { ref, watch } from "vue";
import { ui } from "../../state/ui.ts";

export const themeRevision = ref(0);

/** The current value of a design token, e.g. token("--trace-pulse"). */
export function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

watch(
  () => ui.theme,
  (theme) => {
    document.documentElement.dataset.theme = theme;
    themeRevision.value++;
  },
  { immediate: true },
);

// Text drawn before the fonts arrived used a fallback.
void document.fonts?.ready.then(() => themeRevision.value++);
