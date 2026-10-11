// One take as an archive: the IQ file with its SigMF metadata, the picture,
// the input audio and a manifest row, named and laid out as in the catalog.
import { AUDIO_RATE, type ChainConfig } from "../dsp/config.ts";
import { encodeWav } from "../dsp/wavWrite.ts";
import { type ZipEntry, zip } from "../lib/zip.ts";
import { catalogIq, catalogIqBytes } from "./iq.ts";
import { manifestCsv } from "./manifest.ts";
import { sigmfMeta } from "./sigmf.ts";

export interface BundleParts {
  iq: boolean;
  sigmf: boolean;
  png: boolean;
  wav: boolean;
  manifest: boolean;
}

export interface BundleSource {
  /** The files' common name, without extension. */
  name: string;
  title: string;
  config: ChainConfig;
  pulses: Float32Array;
  pulseCount?: number;
  duty: number;
  /** The 48 kHz input, where there is one. */
  audio?: Float32Array;
  /** The waterfall picture, where one was made. */
  png?: Uint8Array;
  carrierHz?: number;
  created: Date;
}

/** The files of a bundle. Parts that were not asked for, or that the take does not have, are left out. */
export function bundleEntries(source: BundleSource, parts: BundleParts): ZipEntry[] {
  const { name, config, pulses } = source;
  const entries: ZipEntry[] = [];
  if (parts.iq) entries.push({ path: `${name}.iq`, data: catalogIq(pulses) });
  if (parts.sigmf) {
    const meta = sigmfMeta({ dataset: `${name}.iq`, config, title: source.title, pulses: source.pulseCount, dutyCycle: source.duty, carrierHz: source.carrierHz, created: source.created });
    entries.push({ path: `${name}.sigmf-meta`, data: [new TextEncoder().encode(meta)] });
  }
  if (parts.png && source.png) entries.push({ path: `${name}.png`, data: [source.png], store: true });
  if (parts.wav && source.audio) entries.push({ path: `${name}.wav`, data: [encodeWav(source.audio, AUDIO_RATE)] });
  if (parts.manifest) {
    const row = { subfolder: "", name, config, iqBytes: catalogIqBytes(pulses.length), png: Boolean(parts.png && source.png), status: "OK" };
    entries.push({ path: "manifest.csv", data: [new TextEncoder().encode(manifestCsv([row]))] });
  }
  return entries;
}

export function bundle(source: BundleSource, parts: BundleParts): Promise<Blob> {
  return zip(bundleEntries(source, parts), source.created);
}
