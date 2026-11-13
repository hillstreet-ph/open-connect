import type { SupabaseClient } from "@supabase/supabase-js";
import { validateTeamInput, runFreeAgentTeam } from "./agent-team";
import { requestTeamWorker } from "./agent-team-worker.server";

/**
 * Run one private AI Agency team and record it in `autonomous_runs`.
 *
 * Extracted from the `/ai-factory` SPA server function so the merged platform's
 * static Team Builder can run a team through the same code path. The server
 * function and the API route now share this one implementation, so they cannot
 * drift: the run row, the failure accounting and the returned state are
 * identical whichever surface started it.
 *
 * `db` must be a service-role client: the run row is written on behalf of the
 * signed-in owner after the caller has already verified that ownership.
 */
export async function runOwnedFactoryTeam(
  db: SupabaseClient,
  userId: string,
  team: { id: string; name: string; category: string; roles: string[] },
  input: { goal: string; context?: string },
): Promise<{ id: string; state: "succeeded" | "failed" }> {
  const { goal, context } = validateTeamInput(input);

  const { resolveAutoFreeRoutes, resolveUserUpstreams } = await import("./gateway.server");
  const routes = await resolveAutoFreeRoutes(await resolveUserUpstreams(userId, false));
  if (!routes.length)
    throw new Error(
      "No model provider is reachable. Connect a provider in AI Gateway, or confirm the platform Workers AI binding (OC_AI) is deployed.",
    );

  const { finishFactoryProposalRun } = await import("./ai-factory-run-store.server");
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
    user_id: userId,
    goal,
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
    result = await runFreeAgentTeam(routes, { goal, context }, requestTeamWorker, team.roles);
  } catch {
    await finishFactoryProposalRun(db, userId, id, "failed", {
      ...evidence,
      error: "The team request was interrupted. Completion is unverified.",
    });
    throw new Error(`Team run ${id} did not complete. Check its history before retrying.`);
  }

  const state = result.workers.every((worker) => worker.status === "completed")
    ? "succeeded"
    : "failed";
  await finishFactoryProposalRun(db, userId, id, state, { ...evidence, workers: result.workers });
  return { id, state };
}
