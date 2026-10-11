// Writing WAV files, the counterpart of decodeWav in wav.ts.

/** Mono audio (-1..1) as a 16-bit PCM WAV file. Samples that came from 16 bits get them back exactly. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const HEADER_BYTES = 44;
  const file = new Uint8Array(HEADER_BYTES + 2 * samples.length);
  const view = new DataView(file.buffer);
  const tag = (offset: number, name: string) => file.set(new TextEncoder().encode(name), offset);
  tag(0, "RIFF");
  view.setUint32(4, file.length - 8, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  view.setUint32(16, 16, true); // size of the format chunk
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // channels
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, 2 * sampleRate, true); // bytes per second
  view.setUint16(32, 2, true); // bytes per frame
  view.setUint16(34, 16, true); // bits per sample
  tag(36, "data");
  view.setUint32(40, 2 * samples.length, true);
  for (let n = 0; n < samples.length; n++) {
    view.setInt16(HEADER_BYTES + 2 * n, Math.max(-32768, Math.min(32767, Math.round(samples[n] * 32768))), true);
  }
  return file;
}
