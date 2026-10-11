# ZCP Transmitter

Speech as radio pulses, in the browser. Audio (microphone, eSpeak text-to-speech or a file) runs
through a filter chain, every zero crossing of the result becomes one short RF pulse, and an SDR
sends the pulse train. It is a port of a GNU Radio desktop app, and its chain reproduces that
app's output: of the 74 configurations of the app's reference catalog, 56 come out bit for bit and
the other 18 are identical until the speech has ended.

Supported transmitters, all over WebUSB with nothing to install:

| SDR | Driver | Status |
|---|---|---|
| PlutoSDR and compatibles (HamGeek, LibreSDR, Pluto+) | [`src/sdr/pluto.ts`](src/sdr/pluto.ts) | USB link tested on a HamGeek; transmitting and the receive monitor not yet |
| HackRF One | [`src/sdr/hackrf.ts`](src/sdr/hackrf.ts) | written to libhackrf's protocol, untested on hardware |
| none | Record IQ | saves complex64 at 2 MS/s, the catalog's format |

> Only transmit where you are allowed to, and start from the lowest level. A valid amateur radio
> licence is required on the preset frequencies.

## Quick start

```bash
npm install
npm run dev        # then open the printed URL in Chrome, Edge or Brave
```

Type a text and press **Generate Voice**. To transmit, switch **Output** to **Transmit**,
**Connect SDR…**, choose frequency and power, then **Start transmitting**. Without an SDR,
**Save to disk** records what would be sent.

WebUSB exists only in Chromium browsers on desktop; everything except transmitting works without it.

## What is on screen

The console has three panels in the order the signal flows, and a dock below them.

- **Source**: eSpeak, an audio file, the reference sample, or the live microphone. **Monitor**
  plays the input, any stage of the chain or the pulses over the loudspeaker.
- **Signal chain**: the chain as a flowgraph. Each block is a tap: the inspector below shows the
  waveform and spectrum after it. Optional filters switch in place, under the original's rules
  (pre- or de-emphasis, Schmitt or Hilbert, two of the three noise filters at most). Changing a
  setting renders the current take again as a *preview*; a preview is never sent.
  **Presets** keeps named settings and copies a link that carries the whole set-up.
- **Output**: the transmitter or the recorder. On an AD936x board the **Receive monitor** listens
  with the board's own receiver; while transmitting it holds sent pulses against received ones.
- **Dock**: the pulse waterfall of the take (zoom, cursor, PNG, export as ZIP), live instruments
  (rolling waterfall, pulse spacing, duty cycle), and the history of what was played.

**Catalog Lab** is a second workspace: it runs the catalog's 74 configurations over one utterance,
shows them side by side, compares any two pulse by pulse and exports them in the catalog's layout.
Over the reference sample it checks each result against the hashes of GNU Radio's files.

Press `?` for the keyboard shortcuts. None of them starts the transmitter.

## How it works

```
mic / eSpeak / file ─► ZcpChain (48 kHz) ─► pulse train ─► sample-and-hold to the SDR's rate ─► IQ (I = pulse, Q = 0)
                       src/dsp/chain.ts                    src/dsp/resample.ts                  src/sdr/*
```

- `src/dsp/` is the chain and the measurements on it, free of browser and Node APIs, so the app,
  the tests and the command-line tools share it. `blocks.ts` and `firdes.ts` follow the Python
  reference and GNU Radio line for line. A probe can watch every stage; it is handed copies and
  cannot change the signal.
- `src/engine/` connects sources, chain and outputs. The chain runs in workers: one keeps the
  running chain for the microphone, one renders whole utterances, one follows what goes out.
  Only `emit` in `pulses.ts` hands pulses to the transmitter, and only what the user plays gets there.
- `src/sdr/` holds the drivers. A PlutoSDR is driven through its `IIO` USB interface with the same
  iiod text protocol that the command-line tools use over TCP.
- `src/session/` writes what leaves the app: links, WAV, IQ, SigMF metadata, the manifest, ZIP bundles,
  and the history kept in the browser.
- `src/ui/` is the interface: design tokens in `src/styles/tokens.css`, small primitives, and one
  folder per panel. Every text is in `src/text.ts`.

An utterance always passes through a fresh chain, as in the catalog generator, so the same text
and settings give the same pulses every time. The microphone feeds a chain that keeps running.

## Tests

```bash
npm test
```

- `reference.test.ts`: all 74 configurations of the catalog are rendered from the reference
  utterance and compared with `src/catalog/reference.json`, which holds the size and SHA-256 of
  each of GNU Radio's IQ files. 56 match bit for bit. The other 18 (F1 band-pass together with
  decimation or the notch) match until the audio has ended and have the same number of pulses;
  after that the chain amplifies rounding residue, where single pulses fall differently.
- `taps.test.ts`: the same 74 with a probe attached that overwrites everything it is shown.
- `firdes.test.ts`: the filter designs equal GNU Radio's, tap for tap.
- `chunked.test.ts`, `spectrogram.test.ts`, `waterfall.test.ts`: block-wise processing equals one
  pass; the spectrogram keeps the maths of the catalog's pictures; the rolling waterfall equals it.
- `pluto.test.ts`, `iiod.test.ts`: transmitter and receiver against a scripted iiod: lowest level
  until samples flow, every setting restored afterwards.
- `detect.test.ts`, `compare.test.ts`: pulse detection on simulated received IQ; matching of sent
  and received pulses.
- `session.test.ts`, `zip.test.ts`, `history.test.ts`, `ui.test.ts`: file formats, archives,
  storage, and the filter rules as the panels apply them.

## Command line

These talk to a PlutoSDR-compatible board over the network (`SDR_HOST`, default `192.168.2.1`) and
run straight from the TypeScript sources (Node 24 or newer).

```bash
node cli/info.ts                                          # what the board reports; reads only
node cli/monitor.ts <frequencyHz> [seconds] [gainDb]      # listen as the receive monitor does; never transmits
node cli/rx.ts [frequencyHz] [seconds]                    # receive, report level (and pulses when listening longer)
node cli/tx-zcp.ts <frequencyHz> <file.wav> [attenuationDb] [baseline|filter+filter...]
node cli/tx-wav.ts <frequencyHz> <file.wav> [attenuationDb] [fm|am]
node cli/tx.ts <frequencyHz> [seconds] [attenuationDb] [fm|am]   # 1 kHz test tone
```

Attenuation runs from -89.75 (lowest output, the default) to 0 dB. Filters are named as in the
catalog, e.g. `notch+schmitt`.

## The receive monitor

The monitor tunes the receiver half a megahertz below the transmit frequency, sets its gain by
hand and restores every setting when it stops. It uses a third USB pipe, so it runs alongside
the transmitter; both share one sample rate, which the monitor sets only while nothing transmits.

At the lowest levels nothing arrives over the air. To see your own pulses, connect TX to RX by
cable through about 30 dB of attenuation. Because both directions run from one clock, the
comparison shows whether every pulse arrives and the stream is unbroken, not whether the
frequency is accurate.

## Publishing on GitHub Pages

`npm run build` writes a static site to `dist/` that works under any path, so it can be published
as it is: push `dist/` to a `gh-pages` branch, or upload it with the Pages deploy action.

## Adding an SDR

1. Write `src/sdr/<name>.ts` exporting an `SdrDriver` (see [`src/sdr/device.ts`](src/sdr/device.ts)):
   its USB ids and an `open()` that returns an `SdrDevice` with `startTx`, `write`, `setGain`,
   `stopTx` and `close`. `write` must resolve only when the device has taken the chunk, because
   that is what paces the stream. [`hackrf.ts`](src/sdr/hackrf.ts) is the shortest example.
   A device that can receive while it transmits may also offer `rx` and `caps.rxGain`.
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
- Fonts (Inter, JetBrains Mono, both SIL Open Font License) are bundled; the page loads nothing
  from other servers. Icons are from [Lucide](https://lucide.dev) (ISC).
