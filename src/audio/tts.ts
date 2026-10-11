// eSpeak NG in the browser (WebAssembly), called like the command line the
// reference uses: espeak-ng -v <voice> -p 20 -s 130 -w out.wav "<text>".
// For "Test" it produces the very samples the catalog was made from.
import wasmUrl from "espeak-ng/dist/espeak-ng.wasm?url";
import { type Audio, decodeWav } from "../dsp/wav.ts";

export { MAX_TEXT_LENGTH, VOICES } from "./voices.ts";

const PITCH = "20";
const WORDS_PER_MINUTE = "130";
const OUTPUT = "out.wav";

/** Speaks `text` with eSpeak's formant synthesizer. The engine (18 MB) is fetched on first use. */
export async function synthesize(text: string, voice: string): Promise<Audio> {
  const { default: createEspeak } = await import("espeak-ng");
  const errors: string[] = [];
  // Every call is one run of the program, so it gets a fresh instance.
  const espeak = await createEspeak({
    arguments: ["-v", voice, "-p", PITCH, "-s", WORDS_PER_MINUTE, "-w", OUTPUT, "--", text],
    locateFile: () => wasmUrl,
    print: () => {},
    printErr: (line) => errors.push(line),
  });
  try {
    return decodeWav(espeak.FS.readFile(OUTPUT));
  } catch {
    throw new Error(errors[0] ?? "eSpeak produced no audio");
  }
}
