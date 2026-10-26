import registry from "../../config/ai-agency.registry.json" with { type: "json" };
import { redactContext, validateTeamInput, type TeamRoute } from "./agent-team.ts";
import { runFreeAgentTeam } from "./agent-team.ts";

export const AGENCY_TEAMS = registry.teams;
export type AgencyTeamId = (typeof AGENCY_TEAMS)[number]["id"];
export function agencyTeam(id: unknown) {
  const team = AGENCY_TEAMS.find((item) => item.id === id);
  if (!team) throw new Error("Choose an available AI Agency category.");
  return team;
}
export function validateAgencyInput(input: Record<string, unknown>) {
  const team = agencyTeam(input["category"]);
  return { ...validateTeamInput(input), category: team.id };
}

/** Category workers use the existing scoped model router; no second executor or credential store. */
export async function runAgencyTeam(
  routes: TeamRoute[],
  input: ReturnType<typeof validateAgencyInput>,
  request: Parameters<typeof runFreeAgentTeam>[2],
) {
  const team = agencyTeam(input.category);
  const result = await runFreeAgentTeam(routes, input, (route, role, task) => {
    const index = ["Planner", "Builder", "Reviewer"].indexOf(role);
    return request(route, `${team.roles[index]} (${role})`, {
      goal: task.goal,
      context: redactContext(`${team.focus}\n\nSupplied task context:\n${task.context}`),
    });
  });
  return {
    ...result,
    category: team.id,
    team_name: team.name,
    goal: input.goal,
    workers: result.workers.map((worker, index) => ({ ...worker, role: team.roles[index]! })),
  };
}
export type AgencyResult = Awaited<ReturnType<typeof runAgencyTeam>>;
export function agencyTranscript(result: AgencyResult) {
  return redactContext(
    [
      `AI Agency · ${result.team_name}`,
      `Goal: ${result.goal}`,
      "Team outputs are proposals. No external actions have been executed.",
      ...result.workers.map((worker) => `## ${worker.role} · ${worker.status}\n${worker.content}`),
    ].join("\n\n"),
  );
}
