<script setup lang="ts">
// The chain as blocks in the order the signal passes them. A block is a tap
// for the inspector; an optional one also has a switch.
import { STAGES } from "../../dsp/chain.ts";
import { canEnable } from "../../dsp/config.ts";
import { setFilter } from "../../engine/settings.ts";
import { session } from "../../state/session.ts";
import { signal } from "../../state/signal.ts";
import { text } from "../../text.ts";
import { STAGE_INFO, type StageInfo } from "./stages.ts";

const FLOOR_DB = -60;
const t = text.chain;

const isOn = (stage: StageInfo) => !stage.filter || session.config.filters[stage.filter];

/** How far the block's level bar is filled: its peak on a scale from -60 dB to full scale. */
function level(stage: StageInfo): string {
  const peak = stage.id === "deEmphasis" ? Number.NaN : signal.take?.peaks?.[STAGES.indexOf(stage.id)];
  if (peak === undefined || !(peak > 0)) return "0%";
  return `${Math.max(0, Math.min(1, 1 - (20 * Math.log10(peak)) / FLOOR_DB)) * 100}%`;
}

function note(stage: StageInfo): string {
  return stage.filter && !canEnable(session.config.filters, stage.filter) ? `${stage.name}. ${t.noiseBlocked}` : `${stage.name}. ${stage.about}`;
}
</script>

<template>
  <ol class="flow">
    <li v-for="stage in STAGE_INFO" :key="stage.id" class="node" :class="[stage.group, { off: !isOn(stage), selected: signal.stage === stage.id }]">
      <button
        type="button"
        class="tap"
        :title="note(stage)"
        :aria-label="t.selectTap(stage.name)"
        :aria-pressed="signal.stage === stage.id"
        :disabled="stage.id === 'deEmphasis'"
        @click="stage.id !== 'deEmphasis' && (signal.stage = stage.id)"
      >
        <span class="name">{{ stage.short }}</span>
        <span class="level" aria-hidden="true"><i :style="{ width: isOn(stage) ? level(stage) : '0%' }" /></span>
      </button>
      <button
        v-if="stage.filter"
        type="button"
        class="switch"
        role="switch"
        :aria-checked="isOn(stage)"
        :aria-label="t.toggle(stage.name)"
        :title="note(stage)"
        :disabled="!canEnable(session.config.filters, stage.filter)"
        @click="setFilter(stage.filter, !isOn(stage))"
      />
    </li>
  </ol>
</template>

<style scoped>
.flow {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
  gap: var(--s2) 14px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.node {
  position: relative;
  min-width: 0;
  height: 46px;
  background: var(--surface-2);
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  transition:
    background var(--fast) var(--ease),
    border-color var(--fast) var(--ease);
}

/* The arrow to the next block. */
.node:not(:last-child)::after {
  position: absolute;
  top: calc(50% - 4px);
  right: -10px;
  width: 6px;
  height: 6px;
  content: "";
  border-top: 1.5px solid var(--text-faint);
  border-right: 1.5px solid var(--text-faint);
  transform: rotate(45deg) scale(0.9);
}

/* The colour of the filter's group, as in the list. */
.node.conditioning,
.node.noise,
.node.shaping {
  border-left-width: 3px;
}

.node.conditioning {
  border-left-color: var(--group-conditioning);
}

.node.noise {
  border-left-color: var(--group-noise);
}

.node.shaping {
  border-left-color: var(--group-shaping);
}

.node.off {
  background: transparent;
  border-style: dashed;
  border-left-style: solid;
}

.node.off .name {
  color: var(--text-faint);
}

.node:hover {
  border-color: var(--control-border);
}

.node.selected {
  background: var(--accent-soft);
  border-color: var(--accent);
}

.node.conditioning:hover,
.node.conditioning.selected {
  border-left-color: var(--group-conditioning);
}

.node.noise:hover,
.node.noise.selected {
  border-left-color: var(--group-noise);
}

.node.shaping:hover,
.node.shaping.selected {
  border-left-color: var(--group-shaping);
}

.tap {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  width: 100%;
  height: 100%;
  padding: 6px 8px 7px;
  text-align: left;
  background: none;
  border: 0;
  border-radius: 5px;
}

.tap:disabled {
  cursor: default;
}

.name {
  overflow: hidden;
  font-size: var(--text-s);
  font-weight: 600;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.level {
  display: block;
  height: 3px;
  overflow: hidden;
  background: var(--meter-off);
  border-radius: 2px;
}

.level i {
  display: block;
  height: 100%;
  background: var(--trace-stage);
  border-radius: 2px;
  transition: width var(--slow) var(--ease);
}

.switch {
  position: absolute;
  right: 6px;
  bottom: 5px;
  width: 22px;
  height: 12px;
  padding: 0;
  background: var(--meter-off);
  border: 1px solid var(--control-border);
  border-radius: 6px;
  transition:
    background var(--fast) var(--ease),
    border-color var(--fast) var(--ease);
}

/* A larger target than the switch looks. */
.switch::before {
  position: absolute;
  inset: -7px;
  content: "";
}

.switch::after {
  position: absolute;
  top: 1px;
  left: 1px;
  width: 8px;
  height: 8px;
  content: "";
  background: var(--text-muted);
  border-radius: 50%;
  transition: transform var(--fast) var(--ease);
}

.switch[aria-checked="true"] {
  background: var(--accent-fill);
  border-color: var(--accent-fill);
}

.switch[aria-checked="true"]::after {
  background: var(--text-on-fill);
  transform: translateX(10px);
}

.switch:disabled {
  opacity: 0.4;
}

/* Leave the level bar clear of the switch. */
.node:has(.switch) .level {
  margin-right: 28px;
  margin-bottom: 4px;
}
</style>
