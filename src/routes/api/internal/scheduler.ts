import { createFileRoute } from "@tanstack/react-router";
import { verifySchedulerOidc } from "@/lib/github-actions-oidc";
import { cronMatches, nextCronOccurrence } from "@/lib/schedule-cron";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function processDueSchedules() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Generated database types lag the schedules and control-plane migrations.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;
  const now = new Date();
  const nowIso = now.toISOString();
  const leaseOwner = crypto.randomUUID();
  const { data: due, error: dueError } = await db
    .from("schedules")
    .select("id,user_id,name,automation_id,cron_expr,run_at,timezone,next_run_at")
    .eq("status", "active")
    .lte("next_run_at", nowIso)
    .order("next_run_at", { ascending: true })
    .limit(20);
  if (dueError) throw new Error("Could not load due schedules.");

  const results: Array<{ schedule_id: string; status: string }> = [];
  for (const schedule of due ?? []) {
    const leaseUntil = new Date(Date.now() + 4 * 60_000).toISOString();
    const { data: claimed, error: claimError } = await db
      .from("schedules")
      .update({ lease_owner: leaseOwner, lease_expires_at: leaseUntil })
      .eq("id", schedule.id)
      .eq("status", "active")
      .lte("next_run_at", nowIso)
      .or(`lease_expires_at.is.null,lease_expires_at.lt.${nowIso}`)
      .select("id")
      .maybeSingle();
    if (claimError) {
      results.push({ schedule_id: schedule.id, status: "claim_failed" });
      continue;
    }
    if (!claimed) continue;

    let status = "failed";
    let errorText: string | null = null;
    const runId = crypto.randomUUID();
    try {
      if (!schedule.automation_id) throw new Error("Schedule has no linked automation.");
      const { data: automation, error: automationError } = await db
        .from("automations")
        .select("id,user_id,name,description,action_type,config,project_id,enabled")
        .eq("id", schedule.automation_id)
        .eq("user_id", schedule.user_id)
        .maybeSingle();
      if (automationError || !automation) throw new Error("Linked automation was not found.");
      if (!automation.enabled || automation.action_type !== "model")
        throw new Error("Only enabled AI response automations can run on a schedule.");
      const { automationPrompt, generateAutomationResponse } =
        await import("@/lib/automation-model.server");
      const prompt = automationPrompt((automation.config ?? {}) as Record<string, unknown>);
      const { isAutoFreeModel, resolveAutoFreeRoutes, resolveUserUpstreams } =
        await import("@/lib/gateway.server");
      const routes = await resolveAutoFreeRoutes(
        await resolveUserUpstreams(schedule.user_id, false),
      );
      const selectedModel = String(automation.config?.model ?? "open-connect/auto");
      const eligibleRoutes = isAutoFreeModel(selectedModel)
        ? routes
        : routes.filter((route) => route.model === selectedModel);
      if (!eligibleRoutes.length)
        throw new Error("Connect an available free model in AI Gateway before this schedule runs.");

      const evidence = {
        automation_id: automation.id,
        schedule_id: schedule.id,
        project_id: automation.project_id,
        executor: "model",
        trigger: "schedule",
      };
      const { error: startError } = await db.from("autonomous_runs").insert({
        id: runId,
        user_id: schedule.user_id,
        goal: prompt,
        environment: "production",
        state: "running",
        plan: { action: "model", model: selectedModel },
        evidence,
        rollback: { available: false },
        correlation_id: runId,
      });
      if (startError) throw new Error("Could not create scheduled run history.");

      let output: { text: string; model: string } | null = null;
      for (const route of eligibleRoutes) {
        try {
          output = await generateAutomationResponse(prompt, route.upstream, fetch, route.model);
          break;
        } catch {
          // Try the next connected free route; never execute model-proposed tools or code.
        }
      }
      if (!output)
        throw new Error("Connected free models were unavailable for this scheduled run.");
      status = "succeeded";
      const { error: finishError } = await db
        .from("autonomous_runs")
        .update({
          state: status,
          updated_at: new Date().toISOString(),
          evidence: { ...evidence, output: output.text, model: output.model },
        })
        .eq("id", runId)
        .eq("user_id", schedule.user_id);
      if (finishError) throw new Error("The scheduled result could not be saved.");
      await db
        .from("automations")
        .update({ last_run_at: nowIso, last_status: status, updated_at: nowIso })
        .eq("id", automation.id)
        .eq("user_id", schedule.user_id);
    } catch (error) {
      errorText = error instanceof Error ? error.message : "Scheduled run failed.";
      await db
        .from("autonomous_runs")
        .update({
          state: "failed",
          updated_at: new Date().toISOString(),
          evidence: { schedule_id: schedule.id, error: errorText },
        })
        .eq("id", runId)
        .eq("user_id", schedule.user_id);
    }

    const oneShot = !schedule.cron_expr;
    let nextRunAt: string | null = null;
    let scheduleStatus = status === "succeeded" ? (oneShot ? "completed" : "active") : "active";
    if (schedule.cron_expr) {
      try {
        nextRunAt = nextCronOccurrence(
          schedule.cron_expr,
          new Date(),
          schedule.timezone ?? "UTC",
        ).toISOString();
      } catch {
        scheduleStatus = "failed";
        errorText = "Cron expression is invalid or has no upcoming run.";
      }
    } else if (status !== "succeeded") {
      scheduleStatus = "failed";
    }
    await db
      .from("schedules")
      .update({
        status: scheduleStatus,
        next_run_at: nextRunAt,
        last_run_at: new Date().toISOString(),
        lease_owner: null,
        lease_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", schedule.id)
      .eq("lease_owner", leaseOwner);
    if (errorText) {
      await db
        .from("automations")
        .update({ last_run_at: nowIso, last_status: "failed", updated_at: nowIso })
        .eq("id", schedule.automation_id)
        .eq("user_id", schedule.user_id);
    }
    results.push({ schedule_id: schedule.id, status });
  }
  return { checked: due?.length ?? 0, processed: results.length, results };
}

export const Route = createFileRoute("/api/internal/scheduler")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authorization = request.headers.get("authorization") ?? "";
        const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
        if (!token || !(await verifySchedulerOidc(token)))
          return json({ error: "Unauthorized" }, 401);
        try {
          return json(await processDueSchedules());
        } catch {
          return json({ error: "Background scheduler failed." }, 500);
        }
      },
    },
  },
});
