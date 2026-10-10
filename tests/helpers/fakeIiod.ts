// A scripted iiod for driver tests: it keeps attributes, answers the way the
// daemon does and logs every command that changes something.
import { IiodClient, type Transport } from "../../src/sdr/iiod/client.ts";

const decoder = new TextDecoder();
const encoder = new TextEncoder();

export interface FakeIiod {
  client: IiodClient;
  /** Attribute values by "<device> [INPUT|OUTPUT <channel>] <attr>". */
  attrs: Map<string, string>;
  /** "WRITE <target> <attr> = <value>", "OPEN ...", "WRITEBUF <device> <bytes>", "READBUF <device> <bytes>", "CLOSE <device>". */
  log: string[];
}

/**
 * `fail` may return an errno for a command line to make the daemon refuse it.
 * `samples` supplies what READBUF hands out.
 */
export function fakeIiod(
  initial: Record<string, string>,
  options: { fail?: (line: string) => number | undefined; samples?: (bytes: number) => Uint8Array } = {},
): FakeIiod {
  const attrs = new Map(Object.entries(initial));
  const log: string[] = [];
  let inbox = new Uint8Array(0);
  let payload: ((data: Uint8Array) => void) | undefined; // set while the daemon waits for data instead of a command

  const reply = (data: string | Uint8Array) => {
    const bytes = typeof data === "string" ? encoder.encode(data) : data;
    const joined = new Uint8Array(inbox.length + bytes.length);
    joined.set(inbox);
    joined.set(bytes, inbox.length);
    inbox = joined;
  };

  const command = (line: string) => {
    const errno = options.fail?.(line);
    if (errno) return reply(`-${errno}\n`);
    const [verb, ...rest] = line.split(" ");
    if (verb === "READ") {
      const value = attrs.get(rest.join(" "));
      reply(value === undefined ? "-2\n" : `${value.length}\n${value}\n`);
    } else if (verb === "WRITE") {
      const key = rest.slice(0, -1).join(" ");
      payload = (data) => {
        const value = decoder.decode(data).replace(/\0$/, "");
        attrs.set(key, value);
        log.push(`WRITE ${key} = ${value}`);
        reply(`${data.length}\n`);
      };
    } else if (verb === "WRITEBUF") {
      reply("0\n");
      payload = (data) => {
        log.push(`WRITEBUF ${rest[0]} ${data.length}`);
        reply(`${data.length}\n`);
      };
    } else if (verb === "READBUF") {
      const bytes = Number(rest[1]);
      log.push(line);
      reply(`${bytes}\n00000003\n`);
      reply(options.samples?.(bytes) ?? new Uint8Array(bytes));
    } else {
      log.push(line); // OPEN, CLOSE
      reply("0\n");
    }
  };

  const transport: Transport = {
    async send(data) {
      if (!payload) return command(decoder.decode(data).trim());
      const take = payload;
      payload = undefined;
      take(data);
    },
    async recv(max) {
      if (inbox.length === 0) throw new Error("nothing to read");
      const taken = inbox.subarray(0, max);
      inbox = inbox.subarray(taken.length);
      return taken;
    },
    close() {},
  };
  return { client: new IiodClient(transport), attrs, log };
}
