import { redactContext } from "./agent-team.ts";

/** Redact common credential forms before automatic capture or portable export. */
export function redactDataText(value: string): string {
  return redactContext(value)
    .replace(
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
      "[REDACTED PRIVATE KEY]",
    )
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, "$1[REDACTED]@")
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

export type RepeatedContext = {
  key: string;
  kind: "prompt" | "response";
  summary: string;
  count: number;
  memory_ids: string[];
};

export function validateSharedExchange(input: { prompt?: unknown; response?: unknown }) {
  const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
  const response = typeof input.response === "string" ? input.response.trim() : "";
  if (!prompt || !response || prompt.length > 8000 || response.length > 8000)
    throw new Error("Supply an explicitly shared prompt and response, each 1–8000 characters");
  return { prompt, response };
}

/** Exact normalized text only; repetition never establishes factual correctness. */
export function normalizeRepeatedText(text: string) {
  return redactDataText(text).trim().replace(/\s+/g, " ").toLowerCase();
}

export function repeatedContext(rows: Array<{ id: string; metadata: unknown }>): RepeatedContext[] {
  const groups = new Map<string, RepeatedContext>();
  for (const row of rows) {
    const m = row.metadata as Record<string, unknown> | null;
    if (!m || m["auto_capture"] !== true) continue;
    for (const kind of ["prompt", "response"] as const) {
      const hash = m[`${kind}_hash`];
      const summary = m[`${kind}_summary`];
      if (typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash) || typeof summary !== "string")
        continue;
      const key = `${kind}:${hash}`;
      const group = groups.get(key) ?? {
        key,
        kind,
        summary: redactDataText(summary).slice(0, 500),
        count: 0,
        memory_ids: [],
      };
      if (!group.memory_ids.includes(row.id)) {
        group.memory_ids.push(row.id);
        group.count++;
      }
      groups.set(key, group);
    }
  }
  return [...groups.values()]
    .filter((group) => group.count >= 2)
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export function repeatedPromptDraft(group: RepeatedContext) {
  if (group.kind !== "prompt" || group.count < 3)
    throw new Error("Three distinct saved prompt exchanges are required");
  return {
    title: "Repeated prompt: review and generalize",
    content: `# Reusable prompt draft\n\nObserved in ${group.count} distinct saved exchanges. This is an unverified suggestion, not a verified procedure.\n\n## Private source excerpt\n${redactDataText(group.summary)}\n\n## Generalize before sharing\nReplace names, accounts, identifiers and private facts with placeholders.\n\n## Goal and inputs\nDescribe the reusable goal and required inputs.\n\n## Capabilities\nDiscover matching tools, skills, apps or toolkits; verify their actual schemas and account access.\n\n## Acceptance checks\nDefine how to verify the result. Review source, license, permissions and security in Studio before publication.`,
    resource_type: "prompt" as const,
  };
}
