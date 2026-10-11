// The archives must be ones that any unzip opens.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { expect, test } from "vitest";
import { crc32, zip } from "../src/lib/zip.ts";

const text = (value: string) => new TextEncoder().encode(value);

/** Reads an archive back through its central directory. */
function unzip(archive: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const end = archive.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const files = new Map<string, Uint8Array>();
  let at = view.getUint32(end + 16, true);
  for (let n = 0; n < view.getUint16(end + 10, true); n++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const method = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true);
    const packedSize = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(archive.subarray(at + 46, at + 46 + nameLength));
    expect(view.getUint32(local, true)).toBe(0x04034b50);
    const dataAt = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const packed = archive.subarray(dataAt, dataAt + packedSize);
    const data = method === 8 ? new Uint8Array(inflateRawSync(packed)) : packed;
    expect(data.length).toBe(size);
    expect(crc32(data)).toBe(crc);
    files.set(name, data);
    at += 46 + nameLength;
  }
  return files;
}

test("CRC-32 is the one ZIP uses, also over pieces", () => {
  expect(crc32(text("123456789"))).toBe(0xcbf43926);
  expect(crc32(text("6789"), crc32(text("12345")))).toBe(0xcbf43926);
  expect(crc32(new Uint8Array(0))).toBe(0);
});

test("files come back as they went in", async () => {
  const iq = new Float32Array(500_000); // mostly zeros, like an IQ file
  iq.fill(0.5, 1000, 1400);
  const png = Uint8Array.from({ length: 300 }, (_, n) => (n * 37) % 256);
  const archive = new Uint8Array(
    await (
      await zip(
        [
          { path: "manifest.csv", data: [text("a,b\r\n"), text("1,2\r\n")] },
          { path: "_baseline/baseline.iq", data: [iq.subarray(0, 200_000), iq.subarray(200_000)] },
          { path: "_baseline/baseline.png", data: [png], store: true },
          { path: "grüße/leer.txt", data: [] },
        ],
        new Date(2026, 9, 11, 12, 30, 40),
      )
    ).arrayBuffer(),
  );
  const files = unzip(archive);
  expect([...files.keys()]).toEqual(["manifest.csv", "_baseline/baseline.iq", "_baseline/baseline.png", "grüße/leer.txt"]);
  expect(new TextDecoder().decode(files.get("manifest.csv"))).toBe("a,b\r\n1,2\r\n");
  expect(Buffer.from(files.get("_baseline/baseline.iq")!).equals(Buffer.from(iq.buffer))).toBe(true);
  expect(files.get("_baseline/baseline.png")).toEqual(png);
  expect(files.get("grüße/leer.txt")!.length).toBe(0);
  // Two megabytes of IQ shrink to a few kilobytes.
  expect(archive.length).toBeLessThan(10_000);

  // And the system's own unzip agrees, where there is one.
  const folder = mkdtempSync(join(tmpdir(), "zcp-zip-"));
  try {
    writeFileSync(join(folder, "test.zip"), archive);
    let listing: string;
    try {
      listing = execFileSync("unzip", ["-t", join(folder, "test.zip")], { encoding: "utf8" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return; // no unzip on this machine
      throw error;
    }
    expect(listing).toContain("No errors detected");
    // Some builds of unzip cannot create names beyond ASCII, so only the plain ones are unpacked here.
    execFileSync("unzip", ["-q", join(folder, "test.zip"), "_baseline/*", "-d", folder]);
    expect(readFileSync(join(folder, "_baseline", "baseline.png")).equals(Buffer.from(png))).toBe(true);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
