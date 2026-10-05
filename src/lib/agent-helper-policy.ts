export type AgentHelperToolName =
  | "search_marketplace"
  | "list_projects"
  | "list_tasks"
  | "update_task_status"
  | "list_schedules"
  | "list_automations"
  | "install_resource_to_library"
  | "create_task"
  | "create_schedule"
  | "create_manual_ai_automation";

export type AgentHelperToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CRON_FIELD = "(?:\\*|[0-9]+)(?:[-/,](?:\\*|[0-9]+))*";
const CRON = new RegExp(`^${CRON_FIELD} ${CRON_FIELD} ${CRON_FIELD} ${CRON_FIELD} ${CRON_FIELD}$`);

export function parseAgentHelperArguments(value: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("The requested action had invalid arguments. No change was made.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("The requested action had invalid arguments. No change was made.");
  }
  return parsed as Record<string, unknown>;
}

export function helperText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string") throw new Error(`${label} is required.`);
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  if (normalized.length > maxLength) throw new Error(`${label} is too long.`);
  return normalized;
}

export function optionalHelperText(
  value: unknown,
  label: string,
  maxLength: number,
): string | null {
  if (value == null || value === "") return null;
  return helperText(value, label, maxLength);
}

export function helperProjectId(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !UUID.test(value)) {
    throw new Error("Choose a project available to your account.");
  }
  return value;
}

export function helperScheduleTiming(args: Record<string, unknown>) {
  const cronExpr = optionalHelperText(args["cronExpr"], "Cron expression", 100);
  const runAtRaw = optionalHelperText(args["runAt"], "Run time", 80);
  if (!cronExpr && !runAtRaw) throw new Error("Give the schedule a run time or cron expression.");
  if (cronExpr && !CRON.test(cronExpr)) {
    throw new Error("Use a five-field cron expression (minute hour day month weekday).");
  }

  let runAt: string | null = null;
  if (runAtRaw) {
    const parsed = new Date(runAtRaw);
    if (!Number.isFinite(parsed.getTime()))
      throw new Error("Run time must be a valid date and time.");
    runAt = parsed.toISOString();
  }
  const timezone = optionalHelperText(args["timezone"], "Timezone", 80) ?? "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
  } catch {
    throw new Error("Choose a valid IANA timezone, such as Asia/Manila.");
  }
  return { cronExpr, runAt, timezone };
}

export function helperPriority(value: unknown): "low" | "medium" | "high" | "urgent" {
  const priority = value ?? "medium";
  if (priority === "low" || priority === "medium" || priority === "high" || priority === "urgent") {
    return priority;
  }
  throw new Error("Choose low, medium, high, or urgent priority.");
}

export function describeAgentHelperToolResult(
  name: AgentHelperToolName,
  result: Record<string, unknown>,
): string {
  if (typeof result["error"] === "string") {
    return `I couldn't complete that action. ${result["error"]} No change was made.`;
  }
  if (name === "search_marketplace") {
    const results = Array.isArray(result["results"]) ? result["results"] : [];
    return results.length
      ? `I found ${results.length} matching Marketplace resource${results.length === 1 ? "" : "s"}. Ask me to add one to your Library by its exact name.`
      : "I couldn't find a published Marketplace resource matching that search.";
  }
  if (name === "list_projects") {
    const projects = Array.isArray(result["projects"]) ? result["projects"] : [];
    return projects.length
      ? `I found ${projects.length} project${projects.length === 1 ? "" : "s"} available to your account.`
      : "No projects are currently available to your account.";
  }
  if (name === "list_tasks") {
    const tasks = Array.isArray(result["tasks"]) ? result["tasks"] : [];
    return `Loaded ${tasks.length} recent task${tasks.length === 1 ? "" : "s"} available to your account.`;
  }
  if (name === "update_task_status") {
    const task = result["task"] as { title?: unknown; status?: unknown } | undefined;
    return `Updated “${String(task?.title ?? "the task")}” to ${String(task?.status ?? "the selected status")}.`;
  }
  if (name === "list_schedules") {
    const schedules = Array.isArray(result["schedules"]) ? result["schedules"] : [];
    return `Loaded ${schedules.length} schedule${schedules.length === 1 ? "" : "s"}. Linked AI response schedules run through the background runner.`;
  }
  if (name === "list_automations") {
    const automations = Array.isArray(result["automations"]) ? result["automations"] : [];
    return `Loaded ${automations.length} automation${automations.length === 1 ? "" : "s"} available to your account.`;
  }
  if (name === "install_resource_to_library") {
    return `Added ${String(result["name"] ?? "the resource")} to your personal Library. This adds the resource only; it does not execute or connect it.`;
  }
  if (name === "create_task") {
    const task = result["task"] as { title?: unknown } | undefined;
    return `Created the task “${String(task?.title ?? "New task")}”.`;
  }
  if (name === "create_schedule") {
    return `Scheduled “${String((result["schedule"] as { name?: unknown } | undefined)?.name ?? "the AI response")}”. The background runner checks every five minutes and uses connected free models.`;
  }
  return `Created the manual AI automation “${String((result["automation"] as { name?: unknown } | undefined)?.name ?? "New automation")}”. It will run only after a user selects Run in Automations.`;
}
