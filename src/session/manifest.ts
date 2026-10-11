// The catalog's manifest.csv, written the way generate_combinations.py writes it.
import { type ChainConfig, FILTERS } from "../dsp/config.ts";

export interface ManifestRow {
  subfolder: string;
  name: string;
  config: ChainConfig;
  iqBytes: number;
  png: boolean;
  status: string;
}

export const MANIFEST_HEADER = ["subfolder", "name", ...FILTERS.map(({ catalog }) => catalog), "pulse_us", "hpf_hz", "lpf_hz", "iq_bytes", "png", "status"].join(",");

/** A number as Python's str() prints a float: 100 becomes "100.0". */
function pythonFloat(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : String(value);
}

/** A field as Python's csv module writes it: quoted only when it has to be. */
function field(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function manifestLine({ subfolder, name, config, iqBytes, png, status }: ManifestRow): string {
  return [
    field(subfolder),
    field(name),
    ...FILTERS.map(({ key }) => (config.filters[key] ? "1" : "0")),
    pythonFloat(config.pulseUs),
    pythonFloat(config.hpfHz),
    pythonFloat(config.lpfHz),
    String(iqBytes),
    png ? "1" : "0",
    field(status),
  ].join(",");
}

/** The whole file: header and rows, each line ended as Python's csv module ends it. */
export function manifestCsv(rows: ManifestRow[]): string {
  return [MANIFEST_HEADER, ...rows.map(manifestLine)].map((line) => `${line}\r\n`).join("");
}
