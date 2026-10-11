// Writes ZIP archives with the browser's own deflate. IQ files are mostly
// zeros and shrink several hundred times, so everything is deflated unless an
// entry says it is compressed already.

type Pieces = (Uint8Array | Float32Array)[];

export interface ZipEntry {
  /** Path inside the archive, with forward slashes. */
  path: string;
  /**
   * The file's bytes, in as many pieces as is convenient. A function is called
   * when the entry's turn comes, so that large files need not all exist at once.
   */
  data: Pieces | (() => Pieces | Promise<Pieces>);
  /** Keep the bytes as they are, for formats that are compressed already (PNG). */
  store?: boolean;
}

const MAX_SIZE = 0xffff_ffff; // beyond this a ZIP needs the ZIP64 extension, which is not written here
const MAX_ENTRIES = 0xffff;
const UTF8_NAMES = 0x0800;
const DEFLATE = 8;
const STORE = 0;

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let value = n;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function bytesOf(piece: Uint8Array | Float32Array): Uint8Array {
  return piece instanceof Uint8Array ? piece : new Uint8Array(piece.buffer, piece.byteOffset, piece.byteLength);
}

/** CRC-32 as ZIP wants it, carried on from `crc` for data that comes in pieces. */
export function crc32(data: Uint8Array, crc = 0): number {
  let value = ~crc >>> 0;
  for (let n = 0; n < data.length; n++) value = CRC_TABLE[(value ^ data[n]) & 0xff] ^ (value >>> 8);
  return ~value >>> 0;
}

async function deflate(pieces: Uint8Array[]): Promise<Uint8Array> {
  const stream = new Blob(pieces as Uint8Array<ArrayBuffer>[]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** MS-DOS time and date, which is what ZIP stores. */
function dosStamp(date: Date): { time: number; day: number } {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    day: ((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/** `onEntry` is told how many entries are packed, before each one and once at the end. */
export async function zip(entries: ZipEntry[], date = new Date(), onEntry?: (packed: number) => void): Promise<Blob> {
  if (entries.length > MAX_ENTRIES) throw new Error("too many files for one ZIP archive");
  const { time, day } = dosStamp(date);
  const parts: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let offset = 0;

  for (const [index, entry] of entries.entries()) {
    onEntry?.(index);
    const pieces = (typeof entry.data === "function" ? await entry.data() : entry.data).map(bytesOf);
    const size = pieces.reduce((sum, piece) => sum + piece.length, 0);
    const crc = pieces.reduce((value, piece) => crc32(piece, value), 0);
    const packed = entry.store ? pieces : [await deflate(pieces)];
    const packedSize = packed.reduce((sum, piece) => sum + piece.length, 0);
    if (size > MAX_SIZE || offset + packedSize > MAX_SIZE) throw new Error(`${entry.path} makes the archive larger than a ZIP can be`);
    const name = new TextEncoder().encode(entry.path);

    // What the local header and the directory entry share, from "version needed" to the lengths.
    const common = new DataView(new ArrayBuffer(26));
    common.setUint16(0, 20, true); // version needed: 2.0
    common.setUint16(2, UTF8_NAMES, true);
    common.setUint16(4, entry.store ? STORE : DEFLATE, true);
    common.setUint16(6, time, true);
    common.setUint16(8, day, true);
    common.setUint32(10, crc, true);
    common.setUint32(14, packedSize, true);
    common.setUint32(18, size, true);
    common.setUint16(22, name.length, true);
    common.setUint16(24, 0, true); // no extra field

    const local = new Uint8Array(30 + name.length);
    new DataView(local.buffer).setUint32(0, 0x04034b50, true);
    local.set(new Uint8Array(common.buffer), 4);
    local.set(name, 30);

    const listed = new Uint8Array(46 + name.length);
    const listedView = new DataView(listed.buffer);
    listedView.setUint32(0, 0x02014b50, true);
    listedView.setUint16(4, 20, true); // version made by
    listed.set(new Uint8Array(common.buffer), 6);
    listedView.setUint32(42, offset, true); // comment length, disk and attributes before it stay zero
    listed.set(name, 46);

    parts.push(local, ...packed);
    directory.push(listed);
    offset += local.length + packedSize;
  }

  onEntry?.(entries.length);
  const directorySize = directory.reduce((sum, piece) => sum + piece.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, directorySize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...directory, new Uint8Array(end.buffer)] as Uint8Array<ArrayBuffer>[], { type: "application/zip" });
}
