import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { agencyTeamInput, type AgencyRun } from "@/lib/ai-agency";
import { validateTeamInput, runFreeAgentTeam, requestTeamWorker } from "@/lib/agent-team";

export const listAgencyTeams = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listOwnedAgencyTeams } = await import("@/lib/ai-agency.server");
    return listOwnedAgencyTeams(context.supabase as SupabaseClient, context.userId);
  });
export const saveAgencyTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        team: agencyTeamInput,
        id: z.uuid().optional(),
        expectedUpdatedAt: z.iso.datetime({ offset: true }).optional(),
      })
      .refine((input) => !input.id || !!input.expectedUpdatedAt, "Reload the team before editing.")
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { saveOwnedAgencyTeam } = await import("@/lib/ai-agency.server");
    return saveOwnedAgencyTeam(context.supabase as SupabaseClient, context.userId, data);
  });
export const archiveAgencyTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        id: z.uuid(),
        archived: z.boolean(),
        expectedUpdatedAt: z.iso.datetime({ offset: true }),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as SupabaseClient;
    const { data: row, error } = await db
      .from("ai_agency_teams")
      .update({ archived: data.archived, updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .eq("updated_at", data.expectedUpdatedAt)
      .select("id")
      .maybeSingle();
    if (error || !row) throw new Error("Team changed or could not be updated. Refresh and retry.");
    return { ok: true };
  });
export const agencyReadiness = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { resolveAutoFreeRoutes, resolveUserUpstreams } = await import("@/lib/gateway.server");
    const routes = await resolveAutoFreeRoutes(await resolveUserUpstreams(context.userId, false));
    return {
      routes: routes.length,
      providers: [...new Set(routes.map((route) => route.upstream.name))],
    };
  });
export const listAgencyRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ teamId: z.uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const db = context.supabase as SupabaseClient;
    const { data: rows, error } = await db
      .from("autonomous_runs")
      .select("id,state,goal,evidence,created_at")
      .eq("user_id", context.userId)
      .contains("evidence", { executor: "ai_agency", team_id: data.teamId })
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error("Could not load private team history.");
    return (rows ?? []) as AgencyRun[];
  });
export const runAgencyTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({ teamId: z.uuid(), goal: z.string(), context: z.string().default("") })
      .transform((input) => ({ teamId: input.teamId, ...validateTeamInput(input) }))
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { ownedActiveAgencyTeam } = await import("@/lib/ai-agency.server");
    const team = await ownedActiveAgencyTeam(
      context.supabase as SupabaseClient,
      context.userId,
      data.teamId,
    );
    const { resolveAutoFreeRoutes, resolveUserUpstreams } = await import("@/lib/gateway.server");
    const routes = await resolveAutoFreeRoutes(await resolveUserUpstreams(context.userId, false));
    if (!routes.length)
      throw new Error("Connect an available free model provider in AI Gateway first.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as SupabaseClient;
    const id = crypto.randomUUID();
    const evidence = {
      executor: "ai_agency",
      team_id: team.id,
      team_name: team.name,
      category: team.category,
      roles: team.roles,
      execution_performed: false,
    };
    const { error: startError } = await db.from("autonomous_runs").insert({
      id,
      user_id: context.userId,
      goal: data.goal,
      environment: "development",
      state: "running",
      plan: { mode: "proposals", roles: team.roles },
      evidence,
      rollback: { available: false },
      correlation_id: id,
    });
    if (startError) throw new Error("Could not save run history. No AI request was sent.");
    let result: Awaited<ReturnType<typeof runFreeAgentTeam>>;
    try {
      result = await runFreeAgentTeam(
        routes,
        { goal: data.goal, context: data.context },
        requestTeamWorker,
        team.roles,
      );
    } catch {
      await db
        .from("autonomous_runs")
        .update({
          state: "failed",
          updated_at: new Date().toISOString(),
          evidence: {
            ...evidence,
            error: "The team request was interrupted. Completion is unverified.",
          },
        })
        .eq("id", id)
        .eq("user_id", context.userId);
      throw new Error(`Team run ${id} did not complete. Check its history before retrying.`);
    }
    const state = result.workers.every((worker) => worker.status === "completed")
      ? "succeeded"
      : "failed";
    const { error: finishError } = await db
      .from("autonomous_runs")
      .update({
        state,
        updated_at: new Date().toISOString(),
        evidence: { ...evidence, workers: result.workers },
      })
      .eq("id", id)
      .eq("user_id", context.userId);
    if (finishError)
      throw new Error(
        `Run ${id} finished, but saving the result could not be verified. Check history before retrying.`,
      );
    return { id, state };
  });
