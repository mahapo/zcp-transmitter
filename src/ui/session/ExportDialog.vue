<script setup lang="ts">
// Packs the take on screen into one archive.
import { computed, reactive, ref } from "vue";
import { catalogLabel } from "../../dsp/config.ts";
import { fail, say } from "../../engine/status.ts";
import { download, fileStamp } from "../../lib/download.ts";
import { bundle } from "../../session/bundle.ts";
import { catalogIqBytes } from "../../session/iq.ts";
import { radio } from "../../state/radio.ts";
import { signal } from "../../state/signal.ts";
import { text } from "../../text.ts";
import { waterfallPng } from "../canvas/waterfallPng.ts";
import UiButton from "../primitives/UiButton.vue";
import UiCheck from "../primitives/UiCheck.vue";
import UiDialog from "../primitives/UiDialog.vue";

const props = defineProps<{ open: boolean; caption: string }>();
const emit = defineEmits<{ close: [] }>();

const t = text.exporting;
const parts = reactive({ iq: true, sigmf: true, png: true, wav: true, manifest: true });
const working = ref(false);

const take = computed(() => signal.take);
const megabytes = computed(() => catalogIqBytes(take.value?.pulses.length ?? 0) / 1e6);
const hasPng = computed(() => Boolean(take.value?.spectrogram));
const hasWav = computed(() => Boolean(take.value?.audio));
const anything = computed(() => parts.iq || parts.sigmf || parts.manifest || (parts.png && hasPng.value) || (parts.wav && hasWav.value));

async function run() {
  const source = take.value;
  if (!source || working.value) return;
  working.value = true;
  try {
    // A recording is already named after its IQ file; anything else gets a name of the same kind.
    const name = source.title.endsWith(".iq") ? source.title.replace(/\.iq$/, "") : `zcp_${catalogLabel(source.config.filters)}_${fileStamp()}`;
    const png = parts.png && source.spectrogram ? new Uint8Array(await (await waterfallPng(source.spectrogram, props.caption)).arrayBuffer()) : undefined;
    const archive = await bundle(
      {
        name,
        title: source.title,
        config: source.config,
        pulses: source.pulses,
        pulseCount: source.audio ? source.pulseCount : undefined,
        duty: source.duty,
        audio: source.audio,
        png,
        carrierHz: radio.sink === "sdr" ? radio.frequencyHz : undefined,
        created: new Date(),
      },
      parts,
    );
    download(archive, `${name}.zip`);
    say(t.done(`${name}.zip`, archive.size / 1e6));
    emit("close");
  } catch (error) {
    fail(error);
  } finally {
    working.value = false;
  }
}
</script>

<template>
  <UiDialog :open="open" :title="t.title" width="440px" @close="emit('close')">
    <p class="hint intro">{{ t.intro }}</p>
    <div class="parts">
      <UiCheck v-model="parts.iq">{{ t.iq }}<span class="hint note">{{ t.iqNote(megabytes) }}</span></UiCheck>
      <UiCheck v-model="parts.sigmf">{{ t.sigmf }}<span class="hint note">{{ t.sigmfNote }}</span></UiCheck>
      <UiCheck v-model="parts.png" :disabled="!hasPng">{{ t.png }}<span class="hint note">{{ hasPng ? t.pngNote : t.noPng }}</span></UiCheck>
      <UiCheck v-model="parts.wav" :disabled="!hasWav">{{ t.wav }}<span class="hint note">{{ hasWav ? t.wavNote : t.noWav }}</span></UiCheck>
      <UiCheck v-model="parts.manifest">{{ t.manifest }}<span class="hint note">{{ t.manifestNote }}</span></UiCheck>
    </div>
    <template #actions>
      <UiButton @click="emit('close')">{{ text.presets.cancel }}</UiButton>
      <UiButton variant="primary" icon="archive" :busy="working" :disabled="working || !anything" @click="run">{{ working ? t.working : t.go }}</UiButton>
    </template>
  </UiDialog>
</template>

<style scoped>
.intro {
  margin-bottom: var(--s3);
}

.parts {
  display: grid;
  gap: var(--s2);
}

.note {
  display: block;
}

.parts :deep(.check) {
  align-items: flex-start;
}

.parts :deep(.box) {
  margin-top: 2px;
}
</style>
