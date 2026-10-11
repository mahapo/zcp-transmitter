// The chain runs in workers. One keeps the running chain for the microphone,
// another renders whole utterances, so a long render never holds up live blocks.
// A third follows the pulses that go out for the rolling waterfall.
import type { DspAnswer, DspCall, DspReply, DspRequest } from "./protocol.ts";

export class DspClient {
  #worker: Worker | undefined;
  #waiting = new Map<number, { resolve(reply: DspReply<DspRequest>): void; reject(error: Error): void }>();
  #calls = 0;

  /** Started on first use. */
  #start(): Worker {
    const worker = new Worker(new URL("./dsp.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }: MessageEvent<DspAnswer>) => {
      const waiting = this.#waiting.get(data.id);
      this.#waiting.delete(data.id);
      if ("error" in data) waiting?.reject(new Error(data.error));
      else waiting?.resolve(data.reply);
    };
    worker.onerror = (event) => {
      for (const { reject } of this.#waiting.values()) reject(new Error(event.message));
      this.#waiting.clear();
    };
    return worker;
  }

  /** Buffers listed in `transfer` move to the worker and are unusable here afterwards. */
  call<R extends DspRequest>(request: R, transfer: Transferable[] = []): Promise<DspReply<R>> {
    this.#worker ??= this.#start();
    const call: DspCall = { id: this.#calls++, request };
    return new Promise((resolve, reject) => {
      this.#waiting.set(call.id, { resolve: resolve as (reply: DspReply<DspRequest>) => void, reject });
      this.#worker!.postMessage(call, transfer);
    });
  }
}

export const liveDsp = new DspClient();
export const renderDsp = new DspClient();
/** Works out the rolling waterfall, so that neither of the others has to wait for it. */
export const waterfallDsp = new DspClient();
