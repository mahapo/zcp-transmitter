// iiod over the board's "IIO" USB interface, the way libiio's USB backend does
// it: vendor requests open numbered pipes, each a pair of bulk endpoints that
// carries its own iiod session.
import { IiodClient, type Transport } from "./client.ts";

const RESET_PIPES = 0;
const OPEN_PIPE = 1;
const CLOSE_PIPE = 2;
const INTERFACE_NAME = "IIO";
const CDC_CLASS = 2; // the class the firmware gives the interface, with subclass 0

/** Two iiod sessions on one board: attributes stay usable while the other streams samples. */
export interface IioUsb {
  control: IiodClient;
  stream: IiodClient;
  close(): Promise<void>;
}

function findInterface(device: USBDevice): USBInterface {
  const interfaces = device.configuration?.interfaces ?? [];
  const isBulkOnly = (candidate: USBInterface) =>
    candidate.alternate.endpoints.length >= 4 && candidate.alternate.endpoints.every((endpoint) => endpoint.type === "bulk");
  const found =
    interfaces.find((candidate) => candidate.alternate.interfaceName === INTERFACE_NAME) ??
    interfaces.find(
      (candidate) =>
        candidate.alternate.interfaceClass === CDC_CLASS && candidate.alternate.interfaceSubclass === 0 && isBulkOnly(candidate),
    );
  if (!found) throw new Error("this device has no IIO USB interface");
  return found;
}

function pipe(device: USBDevice, input: USBEndpoint, output: USBEndpoint): Transport {
  return {
    async send(data) {
      const result = await device.transferOut(output.endpointNumber, data as Uint8Array<ArrayBuffer>);
      if (result.status !== "ok") throw new Error(`iiod: USB write failed (${result.status})`);
    },
    async recv(max) {
      const result = await device.transferIn(input.endpointNumber, max);
      if (result.status !== "ok" || !result.data) throw new Error(`iiod: USB read failed (${result.status})`);
      return new Uint8Array(result.data.buffer, result.data.byteOffset, result.data.byteLength);
    },
    // Only reached when a reply timed out: nothing short of closing the device cancels the read.
    close() {
      return device.close();
    },
  };
}

/** Opens the IIO interface of a PlutoSDR-compatible board chosen with navigator.usb.requestDevice(). */
export async function openIioUsb(device: USBDevice, timeoutMs = 5000): Promise<IioUsb> {
  await device.open();
  try {
    if (device.configuration === null) await device.selectConfiguration(1);
    const { interfaceNumber, alternate } = findInterface(device);
    await device.claimInterface(interfaceNumber);
    const request = (code: number, value: number) =>
      device.controlTransferOut({ requestType: "vendor", recipient: "interface", request: code, value, index: interfaceNumber });

    // Pipe n is the n-th IN endpoint paired with the n-th OUT endpoint.
    const inputs = alternate.endpoints.filter((endpoint) => endpoint.direction === "in");
    const outputs = alternate.endpoints.filter((endpoint) => endpoint.direction === "out");
    if (inputs.length < 2 || outputs.length < 2) throw new Error("the IIO USB interface has too few pipes");

    await request(RESET_PIPES, 0);
    const clients: IiodClient[] = [];
    for (const index of [0, 1]) {
      await request(OPEN_PIPE, index);
      clients.push(new IiodClient(pipe(device, inputs[index], outputs[index]), timeoutMs));
    }
    return {
      control: clients[0],
      stream: clients[1],
      async close() {
        try {
          for (const index of [0, 1]) await request(CLOSE_PIPE, index);
        } finally {
          await device.close();
        }
      },
    };
  } catch (error) {
    await device.close().catch(() => {});
    throw error;
  }
}
