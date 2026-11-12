import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { FACTORY_CATEGORIES, factoryTeamInput, type FactoryRun } from "@/lib/ai-factory";
import { validateTeamInput } from "@/lib/agent-team";

export const listFactoryTeams = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        category: z.enum(FACTORY_CATEGORIES).optional(),
        archived: z.boolean().default(false),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { listOwnedFactoryTeams } = await import("@/lib/ai-factory.server");
    return listOwnedFactoryTeams(context.supabase as SupabaseClient, context.userId, data);
  });
export const saveFactoryTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        team: factoryTeamInput,
        id: z.uuid().optional(),
        expectedUpdatedAt: z.iso.datetime({ offset: true }).optional(),
      })
      .refine((input) => !input.id || !!input.expectedUpdatedAt, "Reload the team before editing.")
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { saveOwnedFactoryTeam } = await import("@/lib/ai-factory.server");
    return saveOwnedFactoryTeam(context.supabase as SupabaseClient, context.userId, data);
  });
export const archiveFactoryTeam = createServerFn({ method: "POST" })
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
export const factoryReadiness = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { resolveAutoFreeRoutes, resolveUserUpstreams } = await import("@/lib/gateway.server");
    const routes = await resolveAutoFreeRoutes(await resolveUserUpstreams(context.userId, false));
    return {
      routes: routes.length,
      providers: [...new Set(routes.map((route) => route.upstream.name))],
    };
  });
export const listFactoryRuns = createServerFn({ method: "GET" })
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
    return (rows ?? []) as FactoryRun[];
  });
export const runFactoryTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({ teamId: z.uuid(), goal: z.string(), context: z.string().default("") })
      .transform((input) => ({ teamId: input.teamId, ...validateTeamInput(input) }))
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { ownedActiveFactoryTeam } = await import("@/lib/ai-factory.server");
    const team = await ownedActiveFactoryTeam(
      context.supabase as SupabaseClient,
      context.userId,
      data.teamId,
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runOwnedFactoryTeam } = await import("@/lib/ai-factory-team-run.server");
    // One implementation for both surfaces: this server function and the
    // `/api/v1/ai-factory/teams/run` route the merged platform's Team Builder
    // posts to. Keeping the run logic here as well would let the two drift.
    return runOwnedFactoryTeam(
      supabaseAdmin as SupabaseClient,
      context.userId,
      team as { id: string; name: string; category: string; roles: string[] },
      { goal: data.goal, context: data.context },
    );
  });
