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
export const AGENCY_TEMPLATES: AgencyTeamDraft[] = [
  {
    name: "Development team",
    category: "development",
    description: "Plan, implement and review software changes.",
    roles: ["Software Architect", "Developer", "QA Reviewer"],
  },
  {
    name: "Business team",
    category: "business",
    description: "Explore business goals, processes and evidence.",
    roles: ["Business Strategist", "Operations Analyst", "Risk Reviewer"],
  },
  {
    name: "Marketing team",
    category: "marketing",
    description: "Prepare campaign ideas, copy and review criteria.",
    roles: ["Campaign Strategist", "Content Writer", "Brand Reviewer"],
  },
  {
    name: "Research team",
    category: "research",
    description: "Develop a research plan, analysis and verification checklist.",
    roles: ["Research Planner", "Research Analyst", "Evidence Reviewer"],
  },
  {
    name: "Operations team",
    category: "operations",
    description: "Improve a workflow and identify practical handoffs.",
    roles: ["Workflow Coordinator", "Process Designer", "Quality Reviewer"],
  },
  {
    name: "Custom team",
    category: "custom",
    description: "Customize a team for your own workflow.",
    roles: ["Planner", "Builder", "Reviewer"],
  },
];
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
