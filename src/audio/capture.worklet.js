// Collects microphone samples into 50 ms blocks for the main thread.
// Plain JavaScript: the browser loads this file as it is.
const BLOCK_SAMPLES = 2400;

class Capture extends AudioWorkletProcessor {
  #block = new Float32Array(BLOCK_SAMPLES);
  #filled = 0;

  process(inputs) {
    const channel = inputs[0][0];
    if (!channel) return true;
    for (const sample of channel) {
      this.#block[this.#filled++] = sample;
      if (this.#filled < BLOCK_SAMPLES) continue;
      this.port.postMessage(this.#block, [this.#block.buffer]);
      this.#block = new Float32Array(BLOCK_SAMPLES);
      this.#filled = 0;
    }
    return true;
  }
}

registerProcessor("capture", Capture);
