const formatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

/** Localized date and time, or an em dash for missing/invalid input. */
export function formatDateTime(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : formatter.format(date);
}

/** Short "3m ago" style age for recent timestamps, else the formatted date. */
export function formatRelative(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "minute"],
    [3600, "hour"],
    [86400, "day"],
    [2592000, "month"],
    [31536000, "year"],
  ];
  let chosen: [number, Intl.RelativeTimeFormatUnit] = units[0]!;
  for (const unit of units) if (seconds >= unit[0]) chosen = unit;
  const amount = Math.round(seconds / chosen[0]);
  return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(-amount, chosen[1]);
}
