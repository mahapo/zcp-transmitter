// Files leave the page as downloads: the File System Access API is not everywhere.

/** Hands `blob` to the browser as a file download. */
export function download(blob: Blob, name: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
}

/** The local date and time, fit for a file name. */
export function fileStamp(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 19).replace(/[:T]/g, "-");
}
