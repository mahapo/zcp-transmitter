// How the page presents itself: the status line and view settings.
import { reactive } from "vue";

export const ui = reactive({
  /** The latest status or error. */
  message: "",
  failed: false,

  makeSpectrogram: true,
});
