// Every text the engine reports, in one place, so that another language is one
// more file like this.
export const text = {
  status: {
    played: (title: string, seconds: number, pulses: number, duty: number) =>
      `${title}: ${seconds.toFixed(2)} s, ${pulses} pulses, duty cycle ${(100 * duty).toFixed(2)} %`,
    connected: (name: string) => `${name} connected`,
    disconnected: "the SDR was disconnected",
    onAir: (frequencyHz: number, sampleRate: number) =>
      `on air: ${(frequencyHz / 1e6).toFixed(3)} MHz at ${(sampleRate / 1e6).toFixed(3)} MS/s`,
    stopped: "transmitter stopped and restored",
    recording: "recording: speak or press Generate Voice, then stop to save",
    nothingRecorded: "nothing was recorded",
    saved: (name: string, seconds: number) => `saved ${name}: ${seconds.toFixed(2)} s`,
    microphone: (reason: string) => `microphone: ${reason}`,
  },
  title: {
    utterance: (words: string) => `"${words}"`,
    referenceSample: "reference sample",
  },
};
