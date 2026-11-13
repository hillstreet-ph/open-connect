/**
 * Team runs for the merged AI Factory platform: `POST /api/v1/ai-factory/teams/run`.
 *
 * The static `/ai-factory/roster/` platform cannot call a TanStack server
 * function — those are bound into the SPA bundle — so the Team Builder view
 * posts here with the signed-in user's Supabase access token.
 *
 * This is a plain worker handler rather than a file route on purpose: the
 * generated route tree is hand-maintained in this repo, and adding a route
 * there for one endpoint would mean editing a generated file. The MCP endpoint
 * next door is handled the same way.
 *
 * Authentication is the caller's own bearer token, verified against
 * `/auth/v1/user`. The team id is re-checked for ownership before any model
 * call, and the run goes through the same `runOwnedFactoryTeam` implementation
 * the SPA server function uses, so the two surfaces cannot drift.
 */

export const AI_FACTORY_TEAM_RUN_PATH = "/api/v1/ai-factory/teams/run";

const MAX_GOAL = 2000;
const MAX_CONTEXT = 4000;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function userFromRequest(request: Request): Promise<{ id: string } | null> {
  const auth = request.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7).trim();
  if (!token) return null;

  const { PLATFORM_SUPABASE_PUBLIC_KEY, PLATFORM_SUPABASE_URL } =
    await import("@/integrations/supabase/public-config");
  if (!PLATFORM_SUPABASE_URL || !PLATFORM_SUPABASE_PUBLIC_KEY) return null;

  const res = await fetch(`${PLATFORM_SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: PLATFORM_SUPABASE_PUBLIC_KEY, authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const user = (await res.json()) as { id?: string };
  return user?.id ? { id: user.id } : null;
}

/**
 * Handle a team-run request, or return `null` when the path is not ours so the
 * caller can fall through to the next handler.
 */
export async function handleAiFactoryTeamRun(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== AI_FACTORY_TEAM_RUN_PATH) return null;
  if (request.method !== "POST") return json({ error: "Use POST." }, 405);

  const user = await userFromRequest(request);
  if (!user) return json({ error: "Sign in to run a team." }, 401);

  let body: { teamId?: unknown; goal?: unknown; context?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "Send a JSON body." }, 400);
  }

  const teamId = typeof body.teamId === "string" ? body.teamId : "";
  const goal = typeof body.goal === "string" ? body.goal.trim() : "";
  const context = typeof body.context === "string" ? body.context.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(teamId)) return json({ error: "Choose a team to run." }, 400);
  if (!goal) return json({ error: "Describe the goal." }, 400);
  if (goal.length > MAX_GOAL) return json({ error: "The goal is too long." }, 400);
  if (context.length > MAX_CONTEXT) return json({ error: "The context is too long." }, 400);

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ownedActiveFactoryTeam } = await import("@/lib/ai-factory.server");
    const { runOwnedFactoryTeam } = await import("@/lib/ai-factory-team-run.server");
    const team = await ownedActiveFactoryTeam(supabaseAdmin, user.id, teamId);
    const result = await runOwnedFactoryTeam(
      supabaseAdmin,
      user.id,
      team as { id: string; name: string; category: string; roles: string[] },
      { goal, context },
    );
    return json(result);
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "The team run could not be started.";
    return json({ error: message }, 400);
  }
}
