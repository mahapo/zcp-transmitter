// Output to an SDR: connecting, the transmit loop and the level.
import { IqHolder } from "../dsp/resample.ts";
import { type SdrDevice, requestSdr, webUsbAvailable } from "../sdr/device.ts";
import { radio } from "../state/radio.ts";
import { text } from "../text.ts";
import { connection } from "./device.ts";
import { meter, queue } from "./pulses.ts";
import { logSent, resetSent, resumeRx, stopRx, suspendRx } from "./receiver.ts";
import { fail, say } from "./status.ts";

const TAIL_SECONDS = 0.5; // silence while the device plays out what is still queued

export async function connectSdr() {
  if (radio.connecting) return;
  radio.connecting = true;
  try {
    await disconnectSdr();
    const device = (connection.device = await requestSdr());
    radio.device = { name: device.name, caps: device.caps };
    radio.gain = device.caps.gain.initial;
    if (device.caps.rxGain) radio.rxGain = device.caps.rxGain.initial;
    say(text.status.connected(device.name));
  } catch (error) {
    // Closing the browser's device chooser is not an error.
    if (!(error instanceof DOMException && error.name === "NotFoundError")) fail(error);
  } finally {
    radio.connecting = false;
  }
}

export async function disconnectSdr() {
  const device = connection.device;
  if (!device) return;
  await stopTx();
  if (radio.rxWanted) await stopRx();
  await device.close().catch(() => {});
  connection.device = undefined;
  radio.device = null;
}

// An unplugged SDR is gone for good; the transmit loop ends by itself on its failed write.
if (webUsbAvailable()) {
  navigator.usb.addEventListener("disconnect", () => {
    if (!connection.device) return;
    connection.device = undefined;
    radio.device = null;
    radio.rxWanted = false;
    fail(new Error(text.status.disconnected));
  });
}

let transmitting: Promise<void> | undefined;

async function transmit(sdr: SdrDevice) {
  // A receive monitor that set the sample rate for itself must hand it back first: from here on it is the transmitter's.
  await suspendRx();
  const { sampleRate, chunkSamples } = await sdr.startTx({ frequency: radio.frequencyHz, gain: radio.gain });
  try {
    resetSent();
    resumeRx(); // now alongside the transmitter, leaving the rate alone
    const holder = new IqHolder(sampleRate, sdr.caps.format);
    const next = () => {
      const pulses = queue.pull(holder.inputNeeded(chunkSamples));
      meter(pulses);
      logSent(pulses);
      return holder.render(pulses, chunkSamples);
    };
    queue.clear();
    if (radio.tx === "starting") radio.tx = "on"; // unless it was stopped meanwhile
    say(text.status.onAir(radio.frequencyHz, sampleRate));
    // The device takes a chunk when it has room for it, which paces this loop in real time.
    while (radio.tx === "on") await sdr.write(next());
    queue.clear();
    for (let sent = 0; sent < TAIL_SECONDS * sampleRate; sent += chunkSamples) await sdr.write(next());
  } finally {
    // The other way round on the way out: the receiver lets go before the transmitter restores the rate.
    await suspendRx().catch(() => {});
    await sdr.stopTx();
  }
}

export function startTx() {
  const device = connection.device;
  if (!device || radio.tx !== "off") return;
  radio.tx = "starting";
  transmitting = transmit(device)
    .then(() => say(text.status.stopped))
    .catch(fail)
    .finally(() => {
      radio.tx = "off";
      queue.clear();
      resetSent();
      // Only now, with the transmitter off, may a monitor that is still wanted set the rate for itself again.
      resumeRx();
    });
}

export async function stopTx() {
  if (radio.tx === "on" || radio.tx === "starting") radio.tx = "stopping";
  await transmitting;
}

/** Applies a changed power setting, also while on air. */
export async function setGain(gain: number) {
  radio.gain = gain;
  if (radio.tx === "on") await connection.device?.setGain(gain).catch(fail);
}

// A closed tab cannot restore the SDR, so warn before leaving while on air.
addEventListener("beforeunload", (event) => {
  if (radio.tx !== "off") event.preventDefault();
});
