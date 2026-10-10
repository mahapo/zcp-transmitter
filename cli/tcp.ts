// iiod over TCP, for the command-line tools.
import net from "node:net";
import { IIOD_PORT, IiodClient, type Transport } from "../src/sdr/iiod/client.ts";

export const SDR_HOST = process.env.SDR_HOST ?? "192.168.2.1";

class TcpTransport implements Transport {
  #socket: net.Socket;
  #chunks: Buffer[] = [];
  #waiter: { resolve: () => void; reject: (err: Error) => void } | null = null;
  #failure: Error | null = null;

  constructor(socket: net.Socket) {
    this.#socket = socket;
    socket.on("data", (chunk: Buffer) => {
      this.#chunks.push(chunk);
      this.#waiter?.resolve();
    });
    socket.on("error", (err) => this.#fail(err));
    socket.on("close", () => this.#fail(new Error("iiod: connection closed")));
  }

  send(data: Uint8Array): Promise<void> {
    return new Promise((resolve, reject) => this.#socket.write(data, (err) => (err ? reject(err) : resolve())));
  }

  async recv(max: number): Promise<Uint8Array> {
    while (this.#chunks.length === 0) await this.#wait();
    const first = this.#chunks[0];
    if (first.length <= max) return this.#chunks.shift()!;
    this.#chunks[0] = first.subarray(max);
    return first.subarray(0, max);
  }

  close() {
    this.#socket.destroy();
  }

  #fail(err: Error) {
    this.#failure ??= err;
    this.#waiter?.reject(this.#failure);
  }

  #wait(): Promise<void> {
    if (this.#failure) return Promise.reject(this.#failure);
    return new Promise((resolve, reject) => {
      this.#waiter = {
        resolve: () => ((this.#waiter = null), resolve()),
        reject: (err) => ((this.#waiter = null), reject(err)),
      };
    });
  }
}

export function connectTcp(host = SDR_HOST, port = IIOD_PORT, timeoutMs = 5000): Promise<IiodClient> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const timer = setTimeout(() => socket.destroy(new Error(`iiod: could not connect to ${host}:${port}`)), timeoutMs);
    socket.setNoDelay(true);
    socket.once("error", (err) => (clearTimeout(timer), reject(err)));
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve(new IiodClient(new TcpTransport(socket), timeoutMs));
    });
  });
}
