export const CONTEXT_FILE_BUCKET = "memory-knowledge-files";
export const CONTEXT_FILE_LIMIT = 10 * 1024 * 1024;
export function formatStorageBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}
export function assertOwnFilePath(userId: string, path: string) {
  if (!path.startsWith(`${userId}/`) || path.split("/").some((p) => p === ".." || p === "." || !p))
    throw new Error("File is outside your private storage");
  return path;
}
export function previewableImage(mime: string) {
  return /^image\/(png|jpeg|webp|gif|avif)$/i.test(mime);
}

export function storedFileLabel(path: string): string {
  const name = path.split("/").pop() || "File";
  return name.replace(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}-/i, "") || name;
}
