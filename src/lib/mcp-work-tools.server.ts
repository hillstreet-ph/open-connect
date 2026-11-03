import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "../integrations/supabase/types";
import { TASK_PRIORITIES, TASK_STATUSES, taskInput, taskStatusInput } from "./operations.ts";
import { loadOwnedTasks, updateOwnedTaskStatus } from "./ops-data.server.ts";

/**
 * MCP access to the Work section (Tasks, Schedules, Automations).
 *
 * Every query is pinned to the key's user. A project-scoped key may only read
 * and create work inside its own project. Writes never delete rows: "delete"
 * is modelled as status=cancelled so it stays reversible and auditable.
 */
export type WorkKey = { userId: string; projectId?: string | null };
type Db = SupabaseClient<Database>;

export const WORK_TOOL_NAMES = [
  "list_tasks",
  "create_task",
  "update_task_status",
  "list_schedules",
  "list_automations",
  "set_automation_enabled",
] as const;
export type WorkToolName = (typeof WORK_TOOL_NAMES)[number];

export const WORK_TOOL_SCOPES: Record<WorkToolName, string> = {
  list_tasks: "resources:read",
  create_task: "control:write",
  update_task_status: "control:write",
  list_schedules: "resources:read",
  list_automations: "resources:read",
  set_automation_enabled: "control:write",
};

const READ = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

export const WORK_TOOLS = [
  {
    name: "list_tasks",
    description:
      "List your Open-Connect tasks (Work › Task), newest first. Optional project_id and status filters.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string", format: "uuid" },
        status: { type: "string", enum: [...TASK_STATUSES] },
      },
      additionalProperties: false,
    },
    annotations: READ,
  },
  {
    name: "create_task",
    description:
      "Create a task in Work › Task. Use project_id to file it under a project you can access.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", minLength: 1, maxLength: 240 },
        description: { type: "string", maxLength: 8000 },
        priority: { type: "string", enum: [...TASK_PRIORITIES] },
        project_id: { type: "string", format: "uuid" },
        due_at: { type: "string", format: "date-time" },
      },
      required: ["title"],
      additionalProperties: false,
    },
    annotations: WRITE,
  },
  {
    name: "update_task_status",
    description:
      "Move a task to todo, in_progress, blocked, done or cancelled. Cancelling is the reversible way to remove a task.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        status: { type: "string", enum: [...TASK_STATUSES] },
      },
      required: ["id", "status"],
      additionalProperties: false,
    },
    annotations: { ...WRITE, idempotentHint: true },
  },
  {
    name: "list_schedules",
    description: "List your schedules (Work › Schedules) with status and next run time.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: READ,
  },
  {
    name: "list_automations",
    description: "List your automations (Work › Automations) with trigger, action and last status.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: READ,
  },
  {
    name: "set_automation_enabled",
    description: "Turn one of your automations on or off.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        enabled: { type: "boolean" },
      },
      required: ["id", "enabled"],
      additionalProperties: false,
    },
    annotations: { ...WRITE, idempotentHint: true },
  },
];

export function isWorkTool(name: string): name is WorkToolName {
  return (WORK_TOOL_NAMES as readonly string[]).includes(name);
}

function projectFilter(key: WorkKey, requested: unknown): string | null {
  const asked = typeof requested === "string" && requested ? requested : null;
  if (key.projectId) {
    if (asked && asked !== key.projectId)
      throw new Error("Project is outside this API key's project scope.");
    return key.projectId;
  }
  return asked;
}

/**
 * Runs a Work tool. `assertProject` must throw when the key cannot use the project;
 * callers pass the gateway's existing project-access check.
 */
export async function runWorkTool(
  db: Db,
  key: WorkKey,
  name: WorkToolName,
  args: Record<string, unknown>,
  assertProject: (projectId: string) => Promise<unknown>,
) {
  switch (name) {
    case "list_tasks": {
      const status = args["status"];
      if (status !== undefined && !(TASK_STATUSES as readonly unknown[]).includes(status))
        throw new Error("Unknown task status.");
      const projectId = projectFilter(key, args["project_id"]);
      const tasks = await loadOwnedTasks(db, key.userId, {
        projectId,
        status: (status as string | undefined) ?? null,
      });
      return { tasks, count: tasks.length };
    }
    case "create_task": {
      const projectId = projectFilter(key, args["project_id"]);
      const input = taskInput.parse({
        title: args["title"],
        description: args["description"],
        priority: args["priority"],
        projectId: projectId ?? undefined,
        dueAt: args["due_at"],
      });
      if (input.projectId) await assertProject(input.projectId);
      const { data, error } = await db
        .from("tasks")
        .insert({
          user_id: key.userId,
          title: input.title,
          description: input.description ?? null,
          priority: input.priority,
          project_id: input.projectId ?? null,
          due_at: input.dueAt ?? null,
          status: "todo",
        })
        .select("id,title,status,priority,project_id,created_at")
        .single();
      if (error) throw new Error("Could not create the task. Please retry.");
      return { task: data };
    }
    case "update_task_status": {
      const input = taskStatusInput.parse({ id: args["id"], status: args["status"] });
      if (key.projectId) {
        const { data: owned } = await db
          .from("tasks")
          .select("project_id")
          .eq("id", input.id)
          .eq("user_id", key.userId)
          .maybeSingle();
        if (!owned || owned.project_id !== key.projectId)
          throw new Error("Task is outside this API key's project scope.");
      }
      return { task: await updateOwnedTaskStatus(db, key.userId, input) };
    }
    case "list_schedules": {
      let query = db
        .from("schedules")
        .select(
          "id,name,status,cron_expr,run_at,timezone,next_run_at,automation_id,project_id,updated_at",
        )
        .eq("user_id", key.userId)
        .order("updated_at", { ascending: false })
        .limit(100);
      if (key.projectId) query = query.eq("project_id", key.projectId);
      const { data, error } = await query;
      if (error) throw new Error("Could not load your schedules. Please retry.");
      return { schedules: data ?? [], count: data?.length ?? 0 };
    }
    case "list_automations": {
      let query = db
        .from("automations")
        .select(
          "id,name,description,trigger_type,action_type,enabled,last_run_at,last_status,project_id,created_at",
        )
        .eq("user_id", key.userId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (key.projectId) query = query.eq("project_id", key.projectId);
      const { data, error } = await query;
      if (error) throw new Error("Could not load your automations. Please retry.");
      return { automations: data ?? [], count: data?.length ?? 0 };
    }
    case "set_automation_enabled": {
      const input = z.object({ id: z.uuid(), enabled: z.boolean() }).parse(args);
      let query = db
        .from("automations")
        .update({ enabled: input.enabled, updated_at: new Date().toISOString() })
        .eq("id", input.id)
        .eq("user_id", key.userId);
      if (key.projectId) query = query.eq("project_id", key.projectId);
      const { data, error } = await query.select("id,enabled").maybeSingle();
      if (error) throw new Error("Could not update the automation. Please retry.");
      if (!data) throw new Error("Automation not found.");
      return { automation: data };
    }
  }
}
