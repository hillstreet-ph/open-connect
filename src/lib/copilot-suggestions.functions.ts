import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CURATED_SUGGESTIONS = [
  "What can you do in this workspace?",
  "Search my saved context for Open-Connect",
  "List my recent tasks",
  "List my connected apps",
  "Search the marketplace for an Airtable skill",
  "List my automations",
  "Create a task to review my connectors tomorrow",
];

const NEXT_STEP_MAP: Record<string, string[]> = {
  create_task: [
    "Show the full task list",
    "Mark the created task in progress",
    "Create a schedule reminder for this task",
  ],
  update_task_status: [
    "Show the updated task list",
    "Create a follow-up task",
    "Search my saved context related to this task",
  ],
  create_schedule: [
    "List my schedules",
    "Explain what this schedule runs next",
    "Create an automation for the same goal",
  ],
  create_manual_ai_automation: [
    "List my automations",
    "Explain how this automation works",
    "Create a schedule to run it weekly",
  ],
  install_resource_to_library: [
    "List what is installed in my library",
    "Search the marketplace for related resources",
    "Search my saved context for usage examples",
  ],
  draft_connector_plugin: [
    "List my connected apps",
    "Explain the drafted connector steps",
    "Search the marketplace for this connector",
  ],
  create_automation: [
    "List my automations",
    "Create a schedule for this automation",
    "Explain how this automation works",
  ],
};

const DEFAULT_NEXT_STEPS = [
  "Summarize what changed",
  "Search my saved context for related details",
  "Create a task to follow up on this",
];

export const suggestCopilotPrompts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => ({
    input: (input ?? {}) as Record<string, unknown>,
  }))
  .handler(async ({ context }) => {
    const suggestions: string[] = [];
    try {
      const knowledge = await context.supabase
        .from("knowledge_items")
        .select("title, content")
        .is("project_id", null)
        .neq("status", "archived")
        .limit(20);
      for (const row of (knowledge.data ?? []) as Array<Record<string, unknown>>) {
        const title = typeof row["title"] === "string" ? row["title"] : "";
        const bodyText = typeof row["content"] === "string" ? row["content"] : "";
        const label = (title || bodyText).replace(/\s+/g, " ").trim().slice(0, 60);
        if (label) suggestions.push("Find knowledge about " + label);
      }
    } catch {
      /* fall back to curated suggestions when knowledge is unavailable */
    }
    try {
      const memory = await context.supabase.from("memory_records").select("content").limit(20);
      for (const row of (memory.data ?? []) as Array<Record<string, unknown>>) {
        const content = typeof row["content"] === "string" ? row["content"] : "";
        const label = content.replace(/\s+/g, " ").trim().slice(0, 60);
        if (label) suggestions.push("Search my saved memory for " + label);
      }
    } catch {
      /* fall back to curated suggestions when memory is unavailable */
    }
    const seen = new Set<string>();
    const unique = suggestions.filter((item) => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    });
    for (const item of CURATED_SUGGESTIONS) {
      if (unique.length >= 4) break;
      if (!seen.has(item)) {
        seen.add(item);
        unique.push(item);
      }
    }
    return { suggestions: unique.slice(0, 4) };
  });

export const suggestCopilotNextSteps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    const record = (input ?? {}) as Record<string, unknown>;
    return {
      reply: typeof record["reply"] === "string" ? record["reply"].slice(0, 2000) : "",
      action: typeof record["action"] === "string" ? record["action"].slice(0, 80) : "",
    };
  })
  .handler(async ({ data }) => {
    const base = NEXT_STEP_MAP[data.action] ?? DEFAULT_NEXT_STEPS;
    const extra: string[] = [];
    const lower = data.reply.toLowerCase();
    if (lower.includes("task")) extra.push("Show my task list");
    if (lower.includes("schedule")) extra.push("List my schedules");
    if (lower.includes("automation")) extra.push("List my automations");
    if (lower.includes("connector")) extra.push("List my connected apps");
    const seen = new Set<string>();
    const suggestions = [...base, ...extra].filter((item) => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    });
    return { suggestions: suggestions.slice(0, 3) };
  });
