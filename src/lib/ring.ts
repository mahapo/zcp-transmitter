// A ring of the most recent samples of a stream that never ends.

export class Ring {
  #data: Float32Array;
  #next = 0; // where the next sample goes
  /** Samples written since the start. */
  total = 0;

  constructor(capacity: number) {
    this.#data = new Float32Array(capacity);
  }

  get capacity(): number {
    return this.#data.length;
  }

  push(samples: Float32Array) {
    const capacity = this.#data.length;
    // Of a block longer than the ring only the end survives.
    const kept = samples.length > capacity ? samples.subarray(samples.length - capacity) : samples;
    const head = Math.min(kept.length, capacity - this.#next);
    this.#data.set(kept.subarray(0, head), this.#next);
    this.#data.set(kept.subarray(head), 0);
    this.#next = (this.#next + kept.length) % capacity;
    this.total += samples.length;
  }

  /** Writes `count` zeros, for a stretch of the stream that has no samples. */
  skip(count: number) {
    if (count > 0) this.push(new Float32Array(Math.min(count, this.#data.length)));
    this.total += Math.max(0, count - this.#data.length);
  }

  /** A copy of the latest `count` samples, oldest first; silence stands in for what was never written. */
  latest(count: number): Float32Array {
    const capacity = this.#data.length;
    const out = new Float32Array(count);
    const available = Math.min(count, capacity, this.total);
    const start = (this.#next - available + capacity) % capacity;
    const head = Math.min(available, capacity - start);
    out.set(this.#data.subarray(start, start + head), count - available);
    out.set(this.#data.subarray(0, available - head), count - available + head);
    return out;
  }

  clear() {
    this.#data.fill(0);
    this.#next = 0;
    this.total = 0;
  }
}
