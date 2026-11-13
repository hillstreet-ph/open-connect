import registry from "../../config/ai-factory.registry.json" with { type: "json" };
import { z } from "zod";
export const FACTORY_CATEGORIES = [
  "development",
  "business",
  "marketing",
  "research",
  "operations",
  "custom",
] as const;
export const factoryRoles = z
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
export const factoryTeamInput = z.object({
  name: z.string().trim().min(1).max(100),
  category: z.enum(FACTORY_CATEGORIES),
  description: z.string().trim().max(2000).default(""),
  roles: factoryRoles,
});
export type FactoryTeamDraft = z.infer<typeof factoryTeamInput>;
export type FactoryTeam = FactoryTeamDraft & { id: string; archived: boolean; updated_at: string };
export const FACTORY_TEMPLATES: FactoryTeamDraft[] = registry.teams.map((team) =>
  factoryTeamInput.parse({ ...team, category: team.id }),
);
export function factoryTemplate(category: unknown) {
  const id = z.enum(FACTORY_CATEGORIES).parse(category);
  const template = FACTORY_TEMPLATES.find((team) => team.category === id);
  if (!template) throw new Error("Choose an available AI Factory category.");
  return template;
}

export type FactoryWorker = {
  role: string;
  status: "completed" | "unavailable";
  provider: string | null;
  model: string | null;
  content: string;
};
export type FactoryRun = {
  id: string;
  state: string;
  goal: string;
  created_at: string;
  evidence: { team_id?: string; team_name?: string; workers?: FactoryWorker[]; error?: string };
};
export function factoryCategoryLabel(category: string) {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

export function factoryRunTranscript(run: FactoryRun) {
  return [
    `AI Factory · ${run.evidence.team_name ?? "Team"}`,
    `Goal: ${run.goal}`,
    "Team outputs are proposals. No external actions have been executed.",
    ...(run.evidence.workers ?? []).map(
      (worker) => `## ${worker.role} · ${worker.status}\n${worker.content}`,
    ),
  ].join("\n\n");
}
