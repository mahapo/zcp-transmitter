// The status line: what the app last did, or what went wrong.
import { ui } from "../state/ui.ts";

const TOAST_MS = 8000;
let toasts = 0;

export function say(message: string) {
  ui.message = message;
  ui.failed = false;
}

/** Errors also stay on screen for a while, since the status line moves on with the next action. */
export function fail(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  ui.message = message;
  ui.failed = true;
  const id = toasts++;
  ui.toasts.push({ id, message });
  setTimeout(() => dismiss(id), TOAST_MS);
}

export function dismiss(id: number) {
  const index = ui.toasts.findIndex((toast) => toast.id === id);
  if (index >= 0) ui.toasts.splice(index, 1);
}
