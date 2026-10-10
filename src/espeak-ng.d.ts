declare module "espeak-ng" {
  interface EspeakOptions {
    /** Command-line arguments of the espeak-ng program. */
    arguments: string[];
    locateFile?: (path: string) => string;
    print?: (line: string) => void;
    printErr?: (line: string) => void;
  }
  interface Espeak {
    FS: { readFile(path: string): Uint8Array };
  }
  export default function createEspeak(options: EspeakOptions): Promise<Espeak>;
}
