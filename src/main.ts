import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import { createApp } from "vue";
import App from "./App.vue";
import "./styles/tokens.css";
import "./styles/base.css";
import { applyLinkFromAddress, openHistory } from "./engine/library.ts";
import "./ui/canvas/theme.ts";

applyLinkFromAddress();
// A link pasted into the tab the app is already open in does not load the page again.
addEventListener("hashchange", applyLinkFromAddress);
void openHistory();
createApp(App).mount("#app");

// In development the state can be looked at and set from the browser's console. It is not in a build.
if (import.meta.env.DEV) {
  void Promise.all([import("./state/radio.ts"), import("./state/signal.ts"), import("./state/session.ts"), import("./state/ui.ts"), import("./engine/receiver.ts")]).then(
    ([{ radio }, { signal }, { session }, { ui }, { rxScope, rxTick }]) => Object.assign(window, { zcp: { radio, signal, session, ui, rxScope, rxTick } }),
  );
}
