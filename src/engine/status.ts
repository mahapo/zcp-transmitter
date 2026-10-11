// The status line: what the app last did, or what went wrong.
import { ui } from "../state/ui.ts";

export function say(message: string) {
  ui.message = message;
  ui.failed = false;
}

export function fail(error: unknown) {
  ui.message = error instanceof Error ? error.message : String(error);
  ui.failed = true;
}
