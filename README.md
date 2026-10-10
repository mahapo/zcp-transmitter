# ZCP Transmitter

Speech as radio pulses, in the browser. Audio (microphone, eSpeak text-to-speech or a file) runs
through a filter chain, every zero crossing of the result becomes one short RF pulse, and an SDR
sends the pulse train. It is a port of the GNU Radio desktop app whose signal chain lives in
[`Combination_Catalog/`](Combination_Catalog/README.md), and it reproduces that catalog's IQ files.

Supported transmitters, all over WebUSB with nothing to install:

| SDR | Driver | Status |
|---|---|---|
| PlutoSDR and compatibles (HamGeek, LibreSDR, Pluto+) | [`src/sdr/pluto.ts`](src/sdr/pluto.ts) | USB link tested on a HamGeek; transmitting not yet |
| HackRF One | [`src/sdr/hackrf.ts`](src/sdr/hackrf.ts) | written to libhackrf's protocol, untested on hardware |
| none | Record IQ | saves complex64 at 2 MS/s, the catalog's format |

> Only transmit where you are allowed to, and start from the lowest level. A valid amateur radio
> licence is required on the preset frequencies.

## Quick start

```bash
npm install
npm run dev        # then open the printed URL in Chrome, Edge or Brave
```

In the page: type a text and press **Generate Voice** (or use the microphone side), switch **Output**
to the SDR side with the round `<|>` button, **Connect SDR…**, pick the device, choose frequency and
power, then press the TX button. Without an SDR, **Record IQ** saves what would be sent.

WebUSB exists only in Chromium browsers on desktop; generating pulses and Record IQ do not depend
on it.

## How it works

```
mic / eSpeak / file ─► ZcpChain (48 kHz) ─► pulse train ─► sample-and-hold to the SDR's rate ─► IQ (I = pulse, Q = 0)
                       src/dsp/chain.ts                    src/dsp/resample.ts                  src/sdr/*
```

- `src/dsp/` is the chain itself, free of browser and Node APIs, so the app, the tests and the
  command-line tools share it. `blocks.ts` and `firdes.ts` follow `Combination_Catalog/dsp_blocks.py`
  and GNU Radio line for line.
- `src/engine/` runs the chain in a Web Worker and feeds the transmitter or the recorder.
- `src/sdr/` holds the drivers. A PlutoSDR is driven through its `IIO` USB interface with the same
  iiod text protocol that the command-line tools use over TCP.
- `src/components/` is the user interface, laid out like the original app.

An utterance from **Generate Voice** always passes through a fresh chain, as in the catalog
generator, so the same text and settings give the same pulses every time. The microphone feeds a
chain that keeps running.

## Tests

```bash
npm test
```

- `tests/firdes.test.ts`: the filter designs equal GNU Radio's, tap for tap. The reference taps in
  `tests/fixtures/firdes.json` come from `tools/gen_fixtures.py`.
- `tests/chain.golden.test.ts`: all 74 configurations of the catalog are regenerated from
  `Combination_Catalog/_tts/tts_48k.wav` and compared with the catalog's `.iq` files. 56 match bit
  for bit. The other 18 (F1 band-pass together with decimation or the notch) match until the audio has
  ended and have the same number of pulses; after that the chain amplifies rounding residue, where
  single pulses fall differently than in GNU Radio. The test is skipped if the catalog is absent.
- `tests/iiod.test.ts`: the iiod client against a scripted connection.

## Command line

These talk to a PlutoSDR-compatible board over the network (`SDR_HOST`, default `192.168.2.1`) and
run straight from the TypeScript sources (Node 24 or newer).

```bash
node cli/rx.ts [frequencyHz] [seconds]                    # receive, report level (and pulses when listening longer)
node cli/tx-zcp.ts <frequencyHz> <file.wav> [attenuationDb] [baseline|filter+filter...]
node cli/tx-wav.ts <frequencyHz> <file.wav> [attenuationDb] [fm|am]
node cli/tx.ts <frequencyHz> [seconds] [attenuationDb] [fm|am]   # 1 kHz test tone
```

Attenuation runs from -89.75 (lowest output, the default) to 0 dB. Filters are named as in the
catalog, e.g. `notch+schmitt`.

## Publishing on GitHub Pages

`npm run build` writes a static site to `dist/` that works under any path, so it can be published
as it is: push `dist/` to a `gh-pages` branch, or upload it with the Pages deploy action. Keep
`Combination_Catalog/**/*.iq` out of the repository; those files add up to 1.4 GB.

## Adding an SDR

1. Write `src/sdr/<name>.ts` exporting an `SdrDriver` (see [`src/sdr/device.ts`](src/sdr/device.ts)):
   its USB ids and an `open()` that returns an `SdrDevice` with `startTx`, `write`, `setGain`,
   `stopTx` and `close`. `write` must resolve only when the device has taken the chunk, because
   that is what paces the stream. [`hackrf.ts`](src/sdr/hackrf.ts) is the shortest example.
2. Add it to `drivers` in `src/sdr/device.ts`.

The app then offers the device in the browser's chooser and converts the pulses to the sample
format (`s16` or `s8`) and rate the driver reports.

## Differences from the original app

- **De-emphasis does nothing**, as in the original: GNU Radio ignores the single feedback tap the
  app gives its filter, and the catalog's `de_emph` files equal the ones without it.
- **No MBROLA voices**; eSpeak's own formant voice is used, as for the catalog.
- **TX power is the device's gain in dB** instead of a milliwatt preset, which would need
  calibration per device and band.
- The eSpeak engine ([espeak-ng](https://www.npmjs.com/package/espeak-ng), WebAssembly, 18 MB) is
  licensed GPL-3.0-or-later and is fetched when Generate Voice is first pressed.
