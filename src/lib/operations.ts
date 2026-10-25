import { z } from "zod";

export const TASK_STATUSES = ["todo", "in_progress", "blocked", "done", "cancelled"] as const;
export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const taskInput = z.object({
  title: z.string().trim().min(1, "Task title required").max(240),
  description: z.string().trim().max(8000).optional(),
  priority: z.enum(TASK_PRIORITIES).default("medium"),
  projectId: z.uuid().optional(),
  organizationId: z.uuid().optional(),
  dueAt: z.iso.datetime({ offset: true }).optional(),
});
export const templateInput = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(["task", "automation"]),
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().max(8000).default(""),
  priority: z.enum(TASK_PRIORITIES).default("medium"),
});
export type WorkTemplate = z.infer<typeof templateInput> & { id: string };
export const STARTER_TEMPLATES: WorkTemplate[] = [
  {
    id: "starter-focus",
    kind: "task",
    name: "Daily focus",
    title: "Plan today's priorities",
    description: "Review open work, choose three priorities, and record the next action for each.",
    priority: "medium",
  },
  {
    id: "starter-release",
    kind: "task",
    name: "Release checklist",
    title: "Validate a release",
    description:
      "Review the change, run relevant tests, check the deployment, and record the result and rollback reference.",
    priority: "high",
  },
  {
    id: "starter-connect",
    kind: "task",
    name: "Connection check",
    title: "Verify an app connection",
    description:
      "Confirm the intended account and permissions, test one harmless operation, and record any reconnect steps.",
    priority: "medium",
  },
  {
    id: "starter-plan",
    kind: "automation",
    name: "Daily planning",
    title: "Daily planning assistant",
    description:
      "Give me a concise daily planning checklist. Ask for my priorities if I have not supplied them. Do not claim access to my tasks or live data.",
    priority: "medium",
  },
  {
    id: "starter-week",
    kind: "automation",
    name: "Weekly reflection",
    title: "Weekly reflection prompts",
    description:
      "Help me review this week with five focused questions covering progress, blockers, lessons, and next steps. Do not invent completed work.",
    priority: "medium",
  },
];
export function statusLabel(value: string) {
  const labels: Record<string, string> = {
    todo: "To do",
    in_progress: "In progress",
    approval_required: "Needs approval",
    succeeded: "Succeeded",
    planned: "Planned",
  };
  return labels[value] ?? value.replaceAll("_", " ").replace(/^./, (s) => s.toUpperCase());
}
export function statusClass(value: string) {
  if (["done", "succeeded", "completed", "active", "enabled"].includes(value))
    return "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (["failed", "urgent"].includes(value))
    return "border-rose-500/35 bg-rose-500/10 text-rose-700 dark:text-rose-300";
  if (["blocked", "paused", "high", "approval_required"].includes(value))
    return "border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-300";
  if (["in_progress", "running", "medium"].includes(value))
    return "border-sky-500/35 bg-sky-500/10 text-sky-700 dark:text-sky-300";
  return "border-border bg-muted text-muted-foreground";
}
export const RECURRENCES = [
  { value: "0 9 * * *", label: "Daily at 9:00 AM" },
  { value: "0 9 * * 1-5", label: "Weekdays at 9:00 AM" },
  { value: "0 9 * * 1", label: "Mondays at 9:00 AM" },
  { value: "0 * * * *", label: "Every hour" },
] as const;
export function validTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return value;
  } catch {
    throw new Error("Choose a valid IANA timezone.");
  }
}
export function validateOneTime(value: string, now = new Date()) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date <= now)
    throw new Error("Choose a future run date and time.");
  return date.toISOString();
}
