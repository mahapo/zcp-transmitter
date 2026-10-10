// Minimal client for the IIO daemon (iiod) text protocol spoken by libiio 0.x
// firmware (PlutoSDR, LibreSDR, Pluto+ ...). It runs over any Transport: TCP
// from Node (cli/tcp.ts) or the board's USB interface from a browser (webusb.ts).

export const IIOD_PORT = 30431;

/** A byte pipe to iiod. */
export interface Transport {
  /** Sends `data` as one unit; over USB that is one transfer, which iiod reads as one command. */
  send(data: Uint8Array): Promise<void>;
  /** Resolves with 1..`max` bytes once any have arrived. */
  recv(max: number): Promise<Uint8Array>;
  close(): void | Promise<void>;
}

export interface ChannelRef {
  /** Channel id or name, e.g. "voltage0" or "RX_LO". */
  id: string;
  output: boolean;
}

export class IiodError extends Error {
  errno: number;

  constructor(command: string, errno: number) {
    super(`iiod: "${command}" failed with errno ${errno}`);
    this.name = "IiodError";
    this.errno = errno;
  }
}

const LINE_READ = 1024; // more than any reply line; over USB a line ends its transfer
const NEWLINE = 0x0a;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

class Reader {
  #pending = new Uint8Array(0);
  #transport: Transport;
  #timeoutMs: number;

  constructor(transport: Transport, timeoutMs: number) {
    this.#transport = transport;
    this.#timeoutMs = timeoutMs;
  }

  async readExact(length: number): Promise<Uint8Array> {
    while (this.#pending.length < length) await this.#fill(length - this.#pending.length);
    return this.#take(length);
  }

  async readLine(): Promise<string> {
    for (;;) {
      const end = this.#pending.indexOf(NEWLINE);
      if (end >= 0) return decoder.decode(this.#take(end + 1).subarray(0, end));
      await this.#fill(LINE_READ);
    }
  }

  #take(length: number): Uint8Array {
    const taken = this.#pending.subarray(0, length);
    this.#pending = this.#pending.subarray(length);
    return taken;
  }

  async #fill(max: number) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    // A late reply would desynchronise the stream, so a timeout is fatal.
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        void this.#transport.close();
        reject(new Error("iiod: timed out waiting for a reply"));
      }, this.#timeoutMs);
    });
    try {
      const chunk = await Promise.race([this.#transport.recv(max), timeout]);
      const joined = new Uint8Array(this.#pending.length + chunk.length);
      joined.set(this.#pending);
      joined.set(chunk, this.#pending.length);
      this.#pending = joined;
    } finally {
      clearTimeout(timer);
    }
  }
}

export class IiodClient {
  #transport: Transport;
  #reader: Reader;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(transport: Transport, timeoutMs = 5000) {
    this.#transport = transport;
    this.#reader = new Reader(transport, timeoutMs);
  }

  /** iiod drops into an endless `-22` loop on a half-closed connection, so tear it down instead. */
  close(): void | Promise<void> {
    return this.#transport.close();
  }

  version(): Promise<string> {
    return this.#exclusive(async () => {
      await this.#command("VERSION");
      return (await this.#reader.readLine()).trim();
    });
  }

  /** The XML description of every device, channel and attribute on the board. */
  contextXml(): Promise<string> {
    return this.#exclusive(async () => {
      await this.#command("PRINT");
      return decoder.decode(await this.#payload("PRINT"));
    });
  }

  readAttr(device: string, attr: string, channel?: ChannelRef): Promise<string> {
    const command = `READ ${target(device, channel)} ${attr}`;
    return this.#exclusive(async () => {
      await this.#command(command);
      return decoder.decode(await this.#payload(command)).replace(/[\0\n]+$/, "");
    });
  }

  writeAttr(device: string, attr: string, value: string | number, channel?: ChannelRef): Promise<void> {
    const data = encoder.encode(`${value}\0`);
    const command = `WRITE ${target(device, channel)} ${attr} ${data.length}`;
    return this.#exclusive(async () => {
      await this.#command(command);
      await this.#transport.send(data);
      await this.#status(command);
    });
  }

  /**
   * Start streaming on a buffer-capable device. `mask` has one bit per scan
   * index (0b11 = I and Q of the first channel); devices with more than 32
   * channels are not supported. A `cyclic` TX buffer is repeated by the board
   * until `closeBuffer`.
   */
  openBuffer(device: string, samples: number, mask: number, cyclic = false): Promise<void> {
    const command = `OPEN ${device} ${samples} ${mask.toString(16).padStart(8, "0")}${cyclic ? " CYCLIC" : ""}`;
    return this.#exclusive(async () => {
      await this.#command(command);
      await this.#status(command);
    });
  }

  /** Read `bytes` of interleaved samples from a device opened with `openBuffer`. */
  readBuffer(device: string, bytes: number): Promise<Uint8Array> {
    const command = `READBUF ${device} ${bytes}`;
    return this.#exclusive(async () => {
      await this.#command(command);
      const data = new Uint8Array(bytes);
      let received = 0;
      while (received < bytes) {
        const chunk = await this.#status(command);
        if (chunk === 0) break;
        // The first chunk of every READBUF is preceded by the active channel mask.
        if (received === 0) await this.#reader.readLine();
        data.set(await this.#reader.readExact(chunk), received);
        received += chunk;
      }
      return data.subarray(0, received);
    });
  }

  /** Send interleaved samples to a TX device opened with `openBuffer`. */
  writeBuffer(device: string, samples: Uint8Array): Promise<void> {
    const command = `WRITEBUF ${device} ${samples.length}`;
    return this.#exclusive(async () => {
      await this.#command(command);
      await this.#status(command); // go-ahead
      await this.#transport.send(samples);
      await this.#status(command);
    });
  }

  closeBuffer(device: string): Promise<void> {
    const command = `CLOSE ${device}`;
    return this.#exclusive(async () => {
      await this.#command(command);
      await this.#status(command);
    });
  }

  /** Replies are matched to commands by order only, so run one command at a time. */
  #exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.#queue.then(task, task);
    this.#queue = run.catch(() => {});
    return run;
  }

  #command(line: string): Promise<void> {
    return this.#transport.send(encoder.encode(`${line}\r\n`));
  }

  async #status(command: string): Promise<number> {
    const line = await this.#reader.readLine();
    const code = Number.parseInt(line, 10);
    if (Number.isNaN(code)) throw new Error(`iiod: unexpected reply to "${command}": ${line}`);
    if (code < 0) throw new IiodError(command, -code);
    return code;
  }

  /** A length line, then that many bytes and a newline; USB needs the last two read as one. */
  async #payload(command: string): Promise<Uint8Array> {
    const length = await this.#status(command);
    return (await this.#reader.readExact(length + 1)).subarray(0, length);
  }
}

function target(device: string, channel?: ChannelRef): string {
  return channel ? `${device} ${channel.output ? "OUTPUT" : "INPUT"} ${channel.id}` : device;
}

/** Reinterpret little-endian 16-bit samples as an aligned Int16Array (I0, Q0, I1, Q1, ...). */
export function toInt16(samples: Uint8Array): Int16Array {
  const { buffer, byteOffset, length } = samples;
  return new Int16Array(buffer.slice(byteOffset, byteOffset + length - (length % 2)));
}
