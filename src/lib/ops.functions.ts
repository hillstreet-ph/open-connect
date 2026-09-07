import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TaskStatus = "todo" | "in_progress" | "blocked" | "done" | "cancelled";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type ScheduleStatus = "active" | "paused" | "completed" | "failed";
export type TriggerType = "manual" | "schedule" | "webhook" | "event";
export type ActionType = "notify" | "webhook" | "mcp" | "agent" | "pipeline";

/* ─── Tasks ─────────────────────────────────────────────── */

export const listTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { projectId?: string; status?: string }) => ({
    projectId: input?.projectId ?? null,
    status: input?.status ?? null,
  }))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("tasks")
      .select(
        "id, title, description, status, priority, due_at, project_id, organization_id, created_at, updated_at, projects(name, slug)",
      )
      .order("updated_at", { ascending: false })
      .limit(100);
    if (data.projectId) q = q.eq("project_id", data.projectId);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      title: string;
      description?: string;
      priority?: TaskPriority;
      projectId?: string;
      organizationId?: string;
      dueAt?: string;
    }) => ({
      title: (input?.title ?? "").trim(),
      description: (input?.description ?? "").trim() || null,
      priority: (input?.priority ?? "medium") as TaskPriority,
      projectId: input?.projectId || null,
      organizationId: input?.organizationId || null,
      dueAt: input?.dueAt || null,
    }),
  )
  .handler(async ({ data, context }) => {
    if (!data.title) throw new Error("Task title required");
    const { data: row, error } = await context.supabase
      .from("tasks")
      .insert({
        user_id: context.userId,
        title: data.title,
        description: data.description,
        priority: data.priority,
        project_id: data.projectId,
        organization_id: data.organizationId,
        due_at: data.dueAt,
        status: "todo",
      })
      .select("id, title, status, priority, created_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateTaskStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; status: TaskStatus }) => ({
    id: input.id,
    status: input.status,
  }))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("tasks")
      .update({ status: data.status, updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .select("id, status")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

/* ─── Schedules ─────────────────────────────────────────── */

export const listSchedules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("schedules")
      .select(
        "id, name, description, cron_expr, run_at, timezone, status, last_run_at, next_run_at, project_id, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      name: string;
      description?: string;
      cronExpr?: string;
      runAt?: string;
      timezone?: string;
      projectId?: string;
    }) => ({
      name: (input?.name ?? "").trim(),
      description: (input?.description ?? "").trim() || null,
      cronExpr: (input?.cronExpr ?? "").trim() || null,
      runAt: input?.runAt || null,
      timezone: (input?.timezone ?? "UTC").trim() || "UTC",
      projectId: input?.projectId || null,
    }),
  )
  .handler(async ({ data, context }) => {
    if (!data.name) throw new Error("Schedule name required");
    if (!data.cronExpr && !data.runAt) throw new Error("Provide cron expression or run-at time");
    const { data: row, error } = await context.supabase
      .from("schedules")
      .insert({
        user_id: context.userId,
        name: data.name,
        description: data.description,
        cron_expr: data.cronExpr,
        run_at: data.runAt,
        timezone: data.timezone,
        project_id: data.projectId,
        status: "active",
        next_run_at: data.runAt,
      })
      .select("id, name, status, cron_expr, run_at, created_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const setScheduleStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; status: ScheduleStatus }) => ({
    id: input.id,
    status: input.status,
  }))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("schedules")
      .update({ status: data.status, updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .select("id, status")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

/* ─── Automations ───────────────────────────────────────── */

export const listAutomations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("automations")
      .select(
        "id, name, description, trigger_type, action_type, enabled, config, last_run_at, last_status, project_id, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      name: string;
      description?: string;
      triggerType?: TriggerType;
      actionType?: ActionType;
      projectId?: string;
      config?: Record<string, unknown>;
    }) => ({
      name: (input?.name ?? "").trim(),
      description: (input?.description ?? "").trim() || null,
      triggerType: (input?.triggerType ?? "manual") as TriggerType,
      actionType: (input?.actionType ?? "notify") as ActionType,
      projectId: input?.projectId || null,
      config: input?.config ?? {},
    }),
  )
  .handler(async ({ data, context }) => {
    if (!data.name) throw new Error("Automation name required");
    const { data: row, error } = await context.supabase
      .from("automations")
      .insert({
        user_id: context.userId,
        name: data.name,
        description: data.description,
        trigger_type: data.triggerType,
        action_type: data.actionType,
        project_id: data.projectId,
        config: data.config,
        enabled: true,
      })
      .select("id, name, trigger_type, action_type, enabled, created_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const toggleAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; enabled: boolean }) => ({
    id: input.id,
    enabled: Boolean(input.enabled),
  }))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("automations")
      .update({ enabled: data.enabled, updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .select("id, enabled")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const runAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: input.id }))
  .handler(async ({ data, context }) => {
    const now = new Date().toISOString();
    const { data: row, error } = await context.supabase
      .from("automations")
      .update({
        last_run_at: now,
        last_status: "ok",
        updated_at: now,
        config: undefined as unknown as undefined,
      })
      .eq("id", data.id)
      .select("id, name, last_run_at, last_status")
      .single();
    // simpler update without clearing config
    if (error) {
      const { data: row2, error: e2 } = await context.supabase
        .from("automations")
        .update({ last_run_at: now, last_status: "ok", updated_at: now })
        .eq("id", data.id)
        .select("id, name, last_run_at, last_status")
        .single();
      if (e2) throw new Error(e2.message);
      return row2;
    }
    return row;
  });
