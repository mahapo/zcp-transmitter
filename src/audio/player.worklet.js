// Plays blocks of samples as they arrive from the main thread, for listening
// to the microphone's chain while it runs.
// Plain JavaScript: the browser loads this file as it is.
const MAX_QUEUED_SAMPLES = 9600; // 200 ms; beyond that the oldest block goes, so the delay cannot grow

class Player extends AudioWorkletProcessor {
  #blocks = [];
  #queued = 0;
  #offset = 0; // samples of the first block that were played already

  constructor() {
    super();
    this.port.onmessage = ({ data }) => {
      this.#blocks.push(data);
      this.#queued += data.length;
      while (this.#queued > MAX_QUEUED_SAMPLES && this.#blocks.length > 1) {
        this.#queued -= this.#blocks.shift().length - this.#offset;
        this.#offset = 0;
      }
    };
  }

  process(_, outputs) {
    const out = outputs[0][0];
    for (let n = 0; n < out.length; n++) {
      const block = this.#blocks[0];
      if (!block) break; // nothing arrived in time: silence
      out[n] = block[this.#offset++];
      this.#queued--;
      if (this.#offset === block.length) {
        this.#blocks.shift();
        this.#offset = 0;
      }
    }
    return true;
  }
}

registerProcessor("player", Player);
