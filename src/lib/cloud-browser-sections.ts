/** Cloud Browser workspace sections, in display order. `?section=` selects one. */
export const cloudBrowserSections = [
  "agent",
  "browser",
  "search",
  "fetch",
  "research",
  "monitor",
  "datasets",
  "profiles",
] as const;

export type CloudBrowserSection = (typeof cloudBrowserSections)[number];

export function cloudBrowserSection(value: unknown): CloudBrowserSection {
  return cloudBrowserSections.includes(value as CloudBrowserSection)
    ? (value as CloudBrowserSection)
    : "agent";
}

/** Schedule presets for monitors; cron runs in UTC. Topic monitors need >= 30 minutes. */
export const MONITOR_SCHEDULES = [
  { label: "Every hour", cron: "0 * * * *" },
  { label: "Every 6 hours", cron: "0 */6 * * *" },
  { label: "Daily (09:00 UTC)", cron: "0 9 * * *" },
  { label: "Weekdays (09:00 UTC)", cron: "0 9 * * 1-5" },
  { label: "Weekly (Mon 09:00 UTC)", cron: "0 9 * * 1" },
] as const;
