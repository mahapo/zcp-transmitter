// SigMF metadata for the IQ files the app writes, so that tools which read
// SigMF know the format without being told. The data file keeps the catalog's
// ".iq" name, which SigMF calls a non-conforming dataset.
import { CATALOG_RATE, type ChainConfig, catalogLabel } from "../dsp/config.ts";

export interface SigmfDetails {
  /** The name of the IQ file the metadata describes. */
  dataset: string;
  config: ChainConfig;
  title: string;
  /** Zero crossings that triggered a pulse, when known. */
  pulses?: number;
  dutyCycle: number;
  /** The frequency the transmitter was set to. The file itself is baseband. */
  carrierHz?: number;
  created: Date;
}

export function sigmfMeta({ dataset, config, title, pulses, dutyCycle, carrierHz, created }: SigmfDetails): string {
  const meta = {
    global: {
      "core:datatype": "cf32_le",
      "core:sample_rate": CATALOG_RATE,
      "core:version": "1.2.0",
      "core:num_channels": 1,
      "core:dataset": dataset,
      "core:recorder": "ZCP Transmitter",
      "core:description": `Zero-crossing pulses of ${title}: I = pulse train at half scale, Q = 0`,
      "zcp:filters": catalogLabel(config.filters),
      "zcp:pulse_us": config.pulseUs,
      "zcp:hpf_hz": config.hpfHz,
      "zcp:lpf_hz": config.lpfHz,
      "zcp:pulses": pulses,
      "zcp:duty_cycle": dutyCycle,
      "zcp:carrier_hz": carrierHz,
    },
    captures: [{ "core:sample_start": 0, "core:datetime": created.toISOString() }],
    annotations: [],
  };
  return `${JSON.stringify(meta, null, 2)}\n`;
}
