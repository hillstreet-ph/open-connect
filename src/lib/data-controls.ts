import { redactContext } from "./agent-team.ts";

/** Redact common credential forms before automatic capture or portable export. */
export function redactDataText(value: string): string {
  return redactContext(value)
    .replace(/\b(?:sk-(?:oc-)?|oc_live_|sb_secret_|gh[pousr]_|hf_)[A-Za-z0-9_-]{8,}/g, "[REDACTED]")
    .replace(/\bBearer\s+[^\s"']+/gi, "Bearer [REDACTED]")
    .replace(
      /\b(password|passwd|api[_ -]?key|access[_ -]?token|refresh[_ -]?token|secret)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
      "$1: [REDACTED]",
    )
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED]");
}
export function redactDataExport(value: unknown): unknown {
  if (typeof value === "string") return redactDataText(value);
  if (Array.isArray(value)) return value.map(redactDataExport);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        /password|secret|token|credential|authorization|api.?key/i.test(key)
          ? "[REDACTED]"
          : redactDataExport(item),
      ]),
    );
  }
  return value;
}
export type DataControls = {
  capture_activity: boolean;
  save_helper_memory: boolean;
  suggest_drafts: boolean;
  retention_days: number;
};
export const defaultDataControls: DataControls = {
  capture_activity: false,
  save_helper_memory: false,
  suggest_drafts: false,
  retention_days: 90,
};
export function validateDataControls(input: DataControls): DataControls {
  if (![30, 90, 365].includes(input.retention_days)) throw new Error("Choose 30, 90, or 365 days");
  return {
    capture_activity: input.capture_activity === true,
    save_helper_memory: input.save_helper_memory === true,
    suggest_drafts: input.suggest_drafts === true,
    retention_days: input.retention_days,
  };
}
