// What the app needs from a transmitter, and the list of drivers that provide it.
// To support another SDR, write a driver file and add it to `drivers`.
import { hackrf } from "./hackrf.ts";
import { pluto } from "./pluto.ts";

export interface Range {
  min: number;
  max: number;
  step: number;
}

export interface SdrCapabilities {
  /** Carrier frequencies in Hz. */
  frequency: Range;
  /** The device's own output level control. */
  gain: Range & { label: string; unit: string; initial: number };
  /** Interleaved IQ the device takes: 16-bit or 8-bit signed, full scale = the type's range. */
  format: "s16" | "s8";
}

export interface TxSettings {
  /** Carrier frequency in Hz. */
  frequency: number;
  gain: number;
}

export interface TxStream {
  /** The rate the device really runs at, in samples per second. */
  sampleRate: number;
  /** IQ samples every `write` must carry. */
  chunkSamples: number;
}

export interface SdrDevice {
  readonly name: string;
  readonly caps: SdrCapabilities;
  /** Tunes, sets the level and gets ready for `write`. */
  startTx(settings: TxSettings): Promise<TxStream>;
  setGain(gain: number): Promise<void>;
  /** Queues one chunk of interleaved IQ; resolves when the device has taken it, which paces the caller. */
  write(iq: ArrayBufferView): Promise<void>;
  /** Stops transmitting and restores whatever `startTx` changed. */
  stopTx(): Promise<void>;
  close(): Promise<void>;
}

export interface SdrDriver {
  id: string;
  label: string;
  /** The USB devices this driver handles. */
  usbFilters: USBDeviceFilter[];
  open(device: USBDevice): Promise<SdrDevice>;
}

export const drivers: SdrDriver[] = [pluto, hackrf];

export function webUsbAvailable(): boolean {
  return typeof navigator !== "undefined" && "usb" in navigator;
}

function driverFor(device: USBDevice): SdrDriver | undefined {
  return drivers.find((driver) =>
    driver.usbFilters.some((filter) => filter.vendorId === device.vendorId && filter.productId === device.productId),
  );
}

/** Lets the user pick one of the supported SDRs and opens it. Needs a user gesture. */
export async function requestSdr(): Promise<SdrDevice> {
  const device = await navigator.usb.requestDevice({ filters: drivers.flatMap((driver) => driver.usbFilters) });
  return driverFor(device)!.open(device);
}
