// Hashing with the Web Crypto API, which browsers, workers and Node all have.

/** SHA-256 of the bytes `data` covers, as lower-case hex. */
export async function sha256Hex(data: ArrayBufferView): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data as ArrayBufferView<ArrayBuffer>));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
