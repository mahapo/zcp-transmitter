// @vitest-environment happy-dom
// The panels must apply the same rules as the settings behind them, whichever way a filter is switched.
import { mount } from "@vue/test-utils";
import { beforeEach, expect, test, vi } from "vitest";

// Neither component needs storage or a media query, but the state they read looks at both when it loads.
vi.stubGlobal("matchMedia", () => ({ matches: false }));

const { appDefaults, catalogBaseline } = await import("../src/dsp/config.ts");
const { session } = await import("../src/state/session.ts");
const { signal } = await import("../src/state/signal.ts");
const { ui } = await import("../src/state/ui.ts");
const { default: FilterList } = await import("../src/ui/chain/FilterList.vue");
const { default: Flowgraph } = await import("../src/ui/chain/Flowgraph.vue");

beforeEach(() => {
  session.config = appDefaults();
  signal.stage = "agc";
  ui.message = "";
});

const on = () => Object.entries(session.config.filters).flatMap(([key, value]) => (value ? [key] : []));

test("the list shows every filter in its group and blocks a third noise filter", async () => {
  const list = mount(FilterList);
  expect(list.findAll("fieldset").map((group) => group.findAll("input").length)).toEqual([6, 3, 3]);
  const box = (label: string) => list.findAll("label").find((each) => each.text().startsWith(label))!.find("input");

  // The defaults have two noise filters on, so the third cannot be switched.
  expect(box("Envelope Follower").attributes("disabled")).toBeDefined();
  expect(box("Noise Gate").attributes("disabled")).toBeUndefined();
  await box("Noise Gate").setValue(false);
  expect(box("Envelope Follower").attributes("disabled")).toBeUndefined();

  // Hilbert takes Schmitt's place, and says so.
  await box("Hilbert Envelope").setValue(true);
  expect(on()).toContain("hilbert");
  expect(on()).not.toContain("schmitt");
  expect((box("Schmitt Trigger").element as HTMLInputElement).checked).toBe(false);
  expect(ui.message).toBe("Schmitt Trigger switched off: it cannot run together with Hilbert Envelope");

  await box("Pre-emphasis").setValue(true);
  await box("De-emphasis").setValue(true);
  expect(on()).toContain("deEmphasis");
  expect(on()).not.toContain("preEmphasis");
});

test("the flowgraph has a block per stage, switches filters under the same rules and selects taps", async () => {
  const flow = mount(Flowgraph);
  expect(flow.findAll("li").length).toBe(18); // 17 stages and de-emphasis, which is none
  expect(flow.findAll('[role="switch"]').length).toBe(12);
  const toggle = (name: string) => flow.find(`[role="switch"][aria-label="Switch ${name}"]`);

  expect(toggle("Envelope Follower").attributes("disabled")).toBeDefined();
  expect(toggle("Schmitt Trigger").attributes("aria-checked")).toBe("true");
  await toggle("Hilbert Envelope").trigger("click");
  expect(toggle("Schmitt Trigger").attributes("aria-checked")).toBe("false");
  expect(toggle("Hilbert Envelope").attributes("aria-checked")).toBe("true");

  await flow.find('[aria-label="Look at the signal after High-pass"]').trigger("click");
  expect(signal.stage).toBe("hpf");
  expect(flow.find('[aria-label="Look at the signal after High-pass"]').attributes("aria-pressed")).toBe("true");
  // De-emphasis does nothing, so there is no signal of its own to look at.
  expect(flow.find('[aria-label="Look at the signal after De-emphasis"]').attributes("disabled")).toBeDefined();

  session.config = catalogBaseline();
  await flow.vm.$nextTick();
  expect(flow.findAll('[role="switch"][aria-checked="true"]').length).toBe(0);
});
