import type { Json } from "@/integrations/supabase/types";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAutomationRunnable } from "@/lib/automation-readiness";
import { buildAdaptivePlan } from "@/lib/autonomous-control";
import { nextCronOccurrence } from "@/lib/schedule-cron";

export type TaskStatus = "todo" | "in_progress" | "blocked" | "done" | "cancelled";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type ScheduleStatus = "active" | "paused" | "completed" | "failed";
export type TriggerType = "manual" | "schedule" | "webhook" | "event";
export type ActionType = "notify" | "webhook" | "mcp" | "agent" | "pipeline" | "model";

/* ─── Tasks ─────────────────────────────────────────────── */

export const listTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input?: { projectId?: string | undefined; status?: string }) => ({
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
  .validator(
    (input: {
      title: string;
      description?: string | undefined;
      priority?: TaskPriority;
      projectId?: string | undefined;
      organizationId?: string | undefined;
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
  .validator((input: { id: string; status: TaskStatus }) => ({
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
        "id, name, description, cron_expr, run_at, timezone, status, last_run_at, next_run_at, project_id, automation_id, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      name: string;
      description?: string | undefined;
      cronExpr?: string | undefined;
      runAt?: string | undefined;
      timezone?: string;
      projectId?: string | undefined;
      automationId?: string;
    }) => ({
      name: (input?.name ?? "").trim(),
      description: (input?.description ?? "").trim() || null,
      cronExpr: (input?.cronExpr ?? "").trim() || null,
      runAt: input?.runAt || null,
      timezone: (input?.timezone ?? "UTC").trim() || "UTC",
      projectId: input?.projectId || null,
      automationId: input?.automationId || null,
    }),
  )
  .handler(async ({ data, context }) => {
    if (!data.name) throw new Error("Schedule name required");
    if (!data.cronExpr && !data.runAt) throw new Error("Provide cron expression or run-at time");
    if (!data.automationId)
      throw new Error("Choose an enabled AI response automation to run on this schedule.");
    const { data: automation, error: automationError } = await context.supabase
      .from("automations")
      .select("id,action_type,enabled")
      .eq("id", data.automationId)
      .single();
    if (automationError || !automation)
      throw new Error("Choose an automation that belongs to your account.");
    if (automation.action_type !== "model" || !automation.enabled)
      throw new Error("Schedules can currently run enabled AI response automations only.");
    let nextRunAt = data.runAt;
    if (data.cronExpr) {
      nextRunAt = nextCronOccurrence(data.cronExpr, new Date(), data.timezone).toISOString();
    }
    if (data.runAt && !Number.isFinite(Date.parse(data.runAt)))
      throw new Error("Choose a valid run-at date and time.");
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
        automation_id: data.automationId,
        status: "active",
        next_run_at: nextRunAt,
      })
      .select("id, name, status, cron_expr, run_at, automation_id, next_run_at, created_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const setScheduleStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string; status: ScheduleStatus }) => ({
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
  .validator(
    (input: {
      name: string;
      description?: string | undefined;
      triggerType?: TriggerType;
      actionType?: ActionType;
      projectId?: string | undefined;
      config?: Record<string, unknown>;
    }) => ({
      name: (input?.name ?? "").trim(),
      description: (input?.description ?? "").trim() || null,
      triggerType: (input?.triggerType ?? "manual") as TriggerType,
      actionType: (input?.actionType ?? "notify") as ActionType,
      projectId: input?.projectId || null,
      config: JSON.parse(JSON.stringify(input?.config ?? {})) as {
        [key: string]: Json | undefined;
      },
    }),
  )
  .handler(async ({ data, context }) => {
    if (!data.name) throw new Error("Automation name required");
    if (data.actionType === "model") {
      const { automationPrompt } = await import("@/lib/automation-model.server");
      automationPrompt(data.config);
      if (!["manual", "schedule"].includes(data.triggerType))
        throw new Error("AI response automations support manual or scheduled triggers.");
    }
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
  .validator((input: { id: string; enabled: boolean }) => ({
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
  .validator((input: { id: string }) => ({ id: input.id }))
  .handler(async ({ data, context }) => {
    const now = new Date().toISOString();
    const { data: automation, error: automationError } = await context.supabase
      .from("automations")
      .select("id,name,description,action_type,config,project_id,enabled")
      .eq("id", data.id)
      .single();
    if (automationError) throw new Error(automationError.message);
    assertAutomationRunnable(automation);

    if (automation.action_type === "model") {
      const { automationPrompt, generateAutomationResponse } =
        await import("@/lib/automation-model.server");
      const prompt = automationPrompt((automation.config ?? {}) as Record<string, unknown>);
      const { isAutoFreeModel, resolveAutoFreeRoutes, resolveUserUpstreams } =
        await import("@/lib/gateway.server");
      const availableRoutes = await resolveAutoFreeRoutes(
        await resolveUserUpstreams(context.userId),
      );
      const selectedModel = String(
        (automation.config as Record<string, unknown>)?.["model"] ?? "open-connect/auto",
      );
      const routes = isAutoFreeModel(selectedModel)
        ? availableRoutes
        : availableRoutes.filter((route) => route.model === selectedModel);
      if (!routes.length)
        throw new Error(
          isAutoFreeModel(selectedModel)
            ? "Connect a free model provider in AI Gateway before running this automation."
            : "The selected model is not available as a free model from a connected provider.",
        );
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      // Generated database types lag the deployed control-plane schema.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabaseAdmin as any;
      const runId = crypto.randomUUID();
      const evidence = {
        automation_id: automation.id,
        project_id: automation.project_id,
        executor: "model",
      };
      const { error: startError } = await db.from("autonomous_runs").insert({
        id: runId,
        user_id: context.userId,
        goal: prompt,
        environment: "production",
        state: "running",
        plan: {
          action: "model",
          model: String(
            (automation.config as Record<string, unknown>)?.["model"] ?? "open-connect/auto",
          ),
        },
        evidence,
        rollback: { available: false },
        correlation_id: runId,
      });
      if (startError) throw new Error("Could not save the run. No AI request was sent.");
      let result: { text: string; model: string } | null = null;
      let failure: string | null = null;
      try {
        for (const route of routes) {
          try {
            result = await generateAutomationResponse(prompt, route.upstream, fetch, route.model);
            break;
          } catch (error) {
            failure = error instanceof Error ? error.message : "AI request failed.";
          }
        }
      } catch (error) {
        failure = error instanceof Error ? error.message : "AI request failed.";
      }
      const status = result ? "succeeded" : "failed";
      const finishedAt = new Date().toISOString();
      const { error: saveError } = await db
        .from("autonomous_runs")
        .update({
          state: status,
          updated_at: finishedAt,
          evidence: {
            ...evidence,
            output: result?.text ?? null,
            model: result?.model ?? null,
            error: failure,
          },
        })
        .eq("id", runId)
        .eq("user_id", context.userId);
      if (saveError)
        throw new Error(
          `Run ${runId} finished, but its result could not be saved. Check run history before retrying.`,
        );
      const { data: row, error: updateError } = await context.supabase
        .from("automations")
        .update({ last_run_at: now, last_status: status, updated_at: finishedAt })
        .eq("id", data.id)
        .select("id,name,last_run_at,last_status")
        .single();
      if (updateError)
        throw new Error("Run result saved, but the automation summary could not be updated.");
      if (failure) throw new Error(failure);
      return { ...row, correlation_id: runId };
    }

    let correlationId: string | null = null;
    let status = "planned";
    if (automation.action_type === "agent" || automation.action_type === "pipeline") {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: resources, error: resourcesError } = await supabaseAdmin
        .from("resources")
        .select("slug,name,description,resource_type,installation_type")
        .eq("published", true)
        .limit(100);
      if (resourcesError) throw new Error(resourcesError.message);
      const config = (automation.config ?? {}) as Record<string, unknown>;
      const goal = String(config["goal"] ?? automation.description ?? automation.name).trim();
      const requestedEnvironment = String(config["environment"] ?? "development");
      const environment = ["development", "staging", "production"].includes(requestedEnvironment)
        ? requestedEnvironment
        : "development";
      const plan = buildAdaptivePlan(
        goal,
        environment,
        (resources ?? []).map((resource) => ({
          slug: resource.slug,
          name: resource.name,
          description: resource.description,
          resourceType: resource.resource_type,
          installationType: resource.installation_type,
        })),
      );
      correlationId = plan.id;
      status = plan.approvalRequired ? "approval_required" : "planned";
      // Generated Supabase types lag control-plane migrations until type generation runs.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const controlDb = supabaseAdmin as any;
      const { error: runError } = await controlDb.from("autonomous_runs").insert({
        id: plan.id,
        user_id: context.userId,
        goal: plan.goal,
        environment: plan.environment,
        state: status,
        plan,
        evidence: { automation_id: automation.id, verified: false, values_exposed: false },
        rollback: { available: true },
        correlation_id: plan.id,
      });
      if (runError) throw new Error(`Could not save automation plan: ${runError.message}`);
      const { error: eventError } = await controlDb.from("autonomous_run_events").insert({
        user_id: context.userId,
        run_id: plan.id,
        event_type: "planned",
        summary: `Automation ${automation.name} created an autonomous run.`,
        capability_slugs: plan.capabilities.map((capability) => capability.slug),
        evidence: { automation_id: automation.id, values_exposed: false },
      });
      if (eventError)
        throw new Error(`Plan ${plan.id} saved, but audit event failed: ${eventError.message}`);
      if (plan.missingCapability) {
        const { error: requestError } = await controlDb.from("capability_requests").insert({
          user_id: context.userId,
          source_run_id: plan.id,
          requested_capability: plan.goal.slice(0, 240),
          goal: plan.goal,
          state: "draft",
          specification: { executable: false, source: "automation" },
        });
        if (requestError)
          throw new Error(
            `Plan ${plan.id} saved, but capability request failed: ${requestError.message}`,
          );
      }
    }

    const { data: row, error } = await context.supabase
      .from("automations")
      .update({
        last_run_at: now,
        last_status: status,
        updated_at: now,
      })
      .eq("id", data.id)
      .select("id, name, last_run_at, last_status")
      .single();
    if (error) throw new Error(error.message);
    return { ...row, correlation_id: correlationId };
  });

/** RLS and an explicit user filter keep prompt/output history private to its owner. */
export const listAutomationRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = context.supabase as any;
    const { data, error } = await db
      .from("autonomous_runs")
      .select("id,state,evidence,created_at")
      .eq("user_id", context.userId)
      .contains("evidence", { executor: "model" })
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error("Could not load AI run history.");
    return (data ?? []) as {
      id: string;
      state: string;
      created_at: string;
      evidence: {
        automation_id: string;
        output?: string;
        model?: string;
        error?: string;
      };
    }[];
  });
