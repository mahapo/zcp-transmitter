// What a session writes and reads back: links, WAV and IQ files, the manifest and SigMF metadata.
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { ZcpChain } from "../src/dsp/chain.ts";
import { CATALOG_RATE, appDefaults, catalogBaseline, enumerateConfigs, noFilters, normalizeConfig, normalizeFilters } from "../src/dsp/config.ts";
import { toIq } from "../src/dsp/resample.ts";
import { decodeWav } from "../src/dsp/wav.ts";
import { encodeWav } from "../src/dsp/wavWrite.ts";
import { catalogIq, catalogIqBytes } from "../src/session/iq.ts";
import { decodeLink, encodeLink } from "../src/session/link.ts";
import { MANIFEST_HEADER, manifestCsv, manifestLine } from "../src/session/manifest.ts";
import { sigmfMeta } from "../src/session/sigmf.ts";
import { referenceUtterance } from "./helpers/utterance.ts";

test("settings from outside are made to obey the rules", () => {
  expect(normalizeFilters({ preEmphasis: true, deEmphasis: true })).toMatchObject({ preEmphasis: false, deEmphasis: true });
  expect(normalizeFilters({ schmitt: true, hilbert: true })).toMatchObject({ schmitt: false, hilbert: true });
  expect(normalizeFilters({ noiseGate: true, envelopeFollower: true, spectralSub: true })).toMatchObject({ noiseGate: true, envelopeFollower: true, spectralSub: false });
  expect(normalizeFilters({ notch: "yes", bogus: true } as never)).toEqual(noFilters());
  expect(normalizeConfig({ pulseUs: 103, hpfHz: 5000, lpfHz: "x" })).toEqual({ filters: noFilters(), pulseUs: 105, hpfHz: 160, lpfHz: 2300 });
  for (const { config } of enumerateConfigs()) expect(normalizeConfig(config)).toEqual(config);
  expect(normalizeConfig(appDefaults())).toEqual(appDefaults());
});

test("a link carries the set-up there and back", () => {
  const state = { config: appDefaults(), frequencyHz: 1300e6, source: "tts" as const, voice: "de", text: "Guten Tag & 100 % + mehr" };
  const fragment = encodeLink(state);
  expect(fragment).toContain("c=decimate.noise_gate.spectral_sub.hwrect.schmitt");
  expect(decodeLink(`#${fragment}`)).toEqual(state);
  for (const { config } of enumerateConfigs()) expect(decodeLink(encodeLink({ config }))).toEqual({ config });
});

test("a link cannot ask for what the app would not let you set", () => {
  expect(decodeLink("#c=notch")).toBeUndefined(); // not one of ours
  expect(decodeLink("z=2&c=notch")).toBeUndefined();
  expect(decodeLink("z=1&c=pre_emph.de_emph.noise_gate.env_follower.spectral_sub&p=7&h=90&l=99999")!.config).toEqual({
    filters: { ...noFilters(), deEmphasis: true, noiseGate: true, envelopeFollower: true },
    pulseUs: 25,
    hpfHz: 100,
    lpfHz: 3600,
  });
  expect(decodeLink("z=1&c=notch.nonsense")!.config).toEqual(catalogBaseline());
  const odd = decodeLink(`z=1&f=-5&s=radio&v=klingon&t=${"x".repeat(500)}&gain=0`)!;
  expect(odd).toEqual({ config: catalogBaseline(), text: "x".repeat(140) });
  expect(decodeLink("z=1&f=9e12")!.frequencyHz).toBeUndefined();
});

test("WAV files keep 16-bit audio exactly", () => {
  const audio = referenceUtterance();
  const file = encodeWav(audio, 48000);
  expect(file.length).toBe(44 + 2 * audio.length);
  const back = decodeWav(file);
  expect(back.sampleRate).toBe(48000);
  expect(back.samples).toEqual(audio);
  // It is the very file the catalog was made from.
  expect(Buffer.from(file).equals(readFileSync(new URL("../public/samples/test-48k.wav", import.meta.url)))).toBe(true);
  expect(decodeWav(encodeWav(Float32Array.of(2, -2, 0.5), 8000)).samples).toEqual(Float32Array.of(32767 / 32768, -1, 0.5));
});

test("an IQ file written in pieces equals one written at once", () => {
  const pulses = new ZcpChain(appDefaults()).process(referenceUtterance());
  const whole = toIq(pulses, CATALOG_RATE, "cf32") as Float32Array;
  const parts = catalogIq(pulses);
  expect(parts.length).toBe(2); // 1.22 s, one second at a time
  const joined = new Float32Array(parts.reduce((sum, part) => sum + part.length, 0));
  parts.reduce((offset, part) => (joined.set(part, offset), offset + part.length), 0);
  expect(joined.byteLength).toBe(catalogIqBytes(pulses.length));
  expect(Buffer.from(joined.buffer).equals(Buffer.from(whole.buffer, whole.byteOffset, whole.byteLength))).toBe(true);
});

test("the manifest is written as the Python generator writes it", () => {
  expect(MANIFEST_HEADER).toBe(
    "subfolder,name,notch,pre_emph,de_emph,fricative,f1_bandpass,decimate,noise_gate,env_follower,spectral_sub,hwrect,schmitt,hilbert,pulse_us,hpf_hz,lpf_hz,iq_bytes,png,status",
  );
  const baseline = { subfolder: "_baseline", name: "baseline", config: catalogBaseline(), iqBytes: 19496672, png: true, status: "OK" };
  expect(manifestLine(baseline)).toBe("_baseline,baseline,0,0,0,0,0,0,0,0,0,0,0,0,100.0,100.0,2300.0,19496672,1,OK");
  expect(manifestLine({ ...baseline, name: 'a "b", c', status: "ERR:x" })).toContain(',"a ""b"", c",');
  expect(manifestCsv([baseline])).toBe(`${MANIFEST_HEADER}\r\n${manifestLine(baseline)}\r\n`);
});

test("SigMF metadata describes the IQ file", () => {
  const meta = JSON.parse(
    sigmfMeta({ dataset: "zcp_baseline.iq", config: appDefaults(), title: '"Test"', pulses: 389, dutyCycle: 0.0331, carrierHz: 1300e6, created: new Date("2026-10-11T09:00:00Z") }),
  );
  expect(meta.global).toMatchObject({
    "core:datatype": "cf32_le",
    "core:sample_rate": 2000000,
    "core:num_channels": 1,
    "core:dataset": "zcp_baseline.iq",
    "zcp:filters": "decimate+noise_gate+spectral_sub+hwrect+schmitt",
    "zcp:pulse_us": 100,
    "zcp:pulses": 389,
    "zcp:carrier_hz": 1300000000,
  });
  expect(meta.captures).toEqual([{ "core:sample_start": 0, "core:datetime": "2026-10-11T09:00:00.000Z" }]);
  // What is not known is left out, not written as null.
  expect("zcp:pulses" in JSON.parse(sigmfMeta({ dataset: "a.iq", config: appDefaults(), title: "a", dutyCycle: 0, created: new Date(0) })).global).toBe(false);
});
