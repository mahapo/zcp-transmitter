// The iiod client against a scripted transport that behaves like the USB
// pipe: every send is one unit, and replies arrive in pieces.
import { expect, test } from "vitest";
import { IiodClient, IiodError, type Transport } from "../src/sdr/iiod/client.ts";

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const bytes = (value: string) => new TextEncoder().encode(value);

/** Replies with `script(request)` to every send, handing the answer out at most `piece` bytes at a time. */
function fake(script: (request: string) => string, piece = 3) {
  const sent: string[] = [];
  let inbox = new Uint8Array(0);
  const transport: Transport = {
    async send(data) {
      sent.push(text(data));
      inbox = Uint8Array.from([...inbox, ...bytes(script(text(data)))]);
    },
    async recv(max) {
      if (inbox.length === 0) throw new Error("nothing to read");
      const taken = inbox.subarray(0, Math.min(max, piece));
      inbox = inbox.subarray(taken.length);
      return taken;
    },
    close() {},
  };
  return { client: new IiodClient(transport), sent };
}

test("reads an attribute with its trailing newline", async () => {
  const { client, sent } = fake(() => "10\n1300000000\n");
  expect(await client.readAttr("ad9361-phy", "frequency", { id: "altvoltage1", output: true })).toBe("1300000000");
  expect(sent).toEqual(["READ ad9361-phy OUTPUT altvoltage1 frequency\r\n"]);
});

test("writes an attribute as a command and a separate value", async () => {
  const { client, sent } = fake((request) => (request.startsWith("WRITE") ? "" : "7\n"));
  await client.writeAttr("ad9361-phy", "hardwaregain", -89.75, { id: "voltage0", output: true });
  expect(sent).toEqual(["WRITE ad9361-phy OUTPUT voltage0 hardwaregain 7\r\n", "-89.75\0"]);
});

test("streams a buffer after the go-ahead", async () => {
  const { client, sent } = fake((request) => (request.startsWith("OPEN") ? "0\n" : request.startsWith("WRITEBUF") ? "0\n" : "4\n"));
  await client.openBuffer("cf-ad9361-dds-core-lpc", 1, 0b11);
  await client.writeBuffer("cf-ad9361-dds-core-lpc", Uint8Array.of(0, 64, 0, 0));
  expect(sent).toEqual([
    "OPEN cf-ad9361-dds-core-lpc 1 00000003\r\n",
    "WRITEBUF cf-ad9361-dds-core-lpc 4\r\n",
    "\0@\0\0",
  ]);
});

test("reads a buffer that arrives in several chunks", async () => {
  const { client } = fake(() => "2\n00000003\nab" + "2\ncd");
  expect(text(await client.readBuffer("cf-ad9361-lpc", 4))).toBe("abcd");
});

test("turns a negative status into an error", async () => {
  const { client } = fake(() => "-22\n");
  await expect(client.readAttr("ad9361-phy", "nope")).rejects.toThrowError(IiodError);
});
