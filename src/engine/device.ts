// The SDR that is connected, for the parts of the engine that drive it.
import type { SdrDevice } from "../sdr/device.ts";

export const connection: { device?: SdrDevice } = {};
