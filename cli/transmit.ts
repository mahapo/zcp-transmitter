// Plays IQ buffers on the AD936x transmitter, then restores every setting it touched.
import type { IiodClient } from "../src/sdr/iiod/client.ts";
import { PlutoTx, type PlutoTxOptions } from "../src/sdr/pluto.ts";

/**
 * Transmits the buffers `source` makes for the board's actual sample rate, once;
 * Ctrl-C stops early. Also lowers the receiver's sample rate meanwhile.
 */
export async function transmit(
  sdr: IiodClient,
  options: PlutoTxOptions,
  source: (sampleRate: number, chunkSamples: number) => Iterable<ArrayBufferView>,
): Promise<void> {
  const interrupt = new AbortController();
  const onSignal = () => interrupt.abort();
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  const tx = new PlutoTx(sdr);
  try {
    const { sampleRate, chunkSamples } = await tx.start(options);
    let onAir = false;
    for (const chunk of source(sampleRate, chunkSamples)) {
      if (interrupt.signal.aborted) break;
      await tx.write(chunk);
      if (onAir) continue;
      console.log(`on air: ${await tx.describe()} (Ctrl-C to stop)`);
      onAir = true;
    }
  } finally {
    await tx.stop();
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    console.log("transmitter stopped and restored");
  }
}
