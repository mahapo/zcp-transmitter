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
