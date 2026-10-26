import registry from "../../config/ai-agency.registry.json" with { type: "json" };
import { z } from "zod";
export const AGENCY_CATEGORIES = [
  "development",
  "business",
  "marketing",
  "research",
  "operations",
  "custom",
] as const;
export const agencyRoles = z
  .array(
    z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[\p{L}\p{N} .,&()/-]+$/u, "Use plain role names."),
  )
  .min(2, "Add at least two agent roles.")
  .max(6, "Use up to six agent roles.")
  .refine(
    (roles) => new Set(roles.map((role) => role.toLocaleLowerCase())).size === roles.length,
    "Each role must have a different name.",
  );
export const agencyTeamInput = z.object({
  name: z.string().trim().min(1).max(100),
  category: z.enum(AGENCY_CATEGORIES),
  description: z.string().trim().max(2000).default(""),
  roles: agencyRoles,
});
export type AgencyTeamDraft = z.infer<typeof agencyTeamInput>;
export type AgencyTeam = AgencyTeamDraft & { id: string; archived: boolean; updated_at: string };
export const AGENCY_TEMPLATES: AgencyTeamDraft[] = registry.teams.map((team) =>
  agencyTeamInput.parse({ ...team, category: team.id }),
);
export function agencyTemplate(category: unknown) {
  const id = z.enum(AGENCY_CATEGORIES).parse(category);
  const template = AGENCY_TEMPLATES.find((team) => team.category === id);
  if (!template) throw new Error("Choose an available AI Agency category.");
  return template;
}

export type AgencyWorker = {
  role: string;
  status: "completed" | "unavailable";
  provider: string | null;
  model: string | null;
  content: string;
};
export type AgencyRun = {
  id: string;
  state: string;
  goal: string;
  created_at: string;
  evidence: { team_id?: string; team_name?: string; workers?: AgencyWorker[]; error?: string };
};
export function agencyCategoryLabel(category: string) {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

export function agencyRunTranscript(run: AgencyRun) {
  return [
    `AI Agency · ${run.evidence.team_name ?? "Team"}`,
    `Goal: ${run.goal}`,
    "Team outputs are proposals. No external actions have been executed.",
    ...(run.evidence.workers ?? []).map(
      (worker) => `## ${worker.role} · ${worker.status}\n${worker.content}`,
    ),
  ].join("\n\n");
}
