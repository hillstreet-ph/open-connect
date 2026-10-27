import engineering from "../../config/ai-agency.engineering.json" with { type: "json" };
import { workforceConfig, type WorkforceConfig } from "./workforce.ts";
const leads = [
  ["engineering", "open-agentDev", "Software Engineering Lead"],
  ["design", "open-agentDesign", "UI/UX Design Lead"],
  ["marketing", "open-agentMarketing", "Marketing Lead"],
  ["operations", "open-agentOps", "Operations Lead"],
  ["research", "open-agentResearch", "Research Lead"],
  ["finance", "open-agentFinance", "Finance Lead"],
  ["support", "open-agentSupport", "Customer Support Lead"],
  ["infrastructure", "open-agentInfrastructure", "Infrastructure Lead"],
  ["security", "open-agentSecurityLead", "Security Lead"],
  ["automation", "open-agentAutomation", "Automation Lead"],
];
const engineers = [
  ["open-agentArchitect", "Software Architect"],
  ["open-agentDeveloper", "Developer"],
  ["open-agentQA", "QA Reviewer"],
  ["open-agentFrontend", "Frontend Specialist"],
  ["open-agentDevOps", "DevOps Specialist"],
  ["open-agentSecurity", "Security Specialist"],
  ["open-agentDocs", "Technical Writing Specialist"],
];
// Reuse canonical proposed Engineering IDs for equivalent roles; preserve the source
// registry (including Mobile Engineer) without silently instantiating a different roster.
const identities: Record<string, string> = {
  "open-agentArchitect": "open-agentDev-solution-architect",
  "open-agentDeveloper": "open-agentDev-backend-engineer",
  "open-agentQA": "open-agentDev-qa-automation",
  "open-agentFrontend": "open-agentDev-frontend-engineer",
  "open-agentDevOps": "open-agentDev-devops-engineer",
  "open-agentDocs": "open-agentDev-documentation-engineer",
  "open-agentSecurity": "open-agentDev-security-specialist",
};
for (const id of Object.values(identities).filter((id) => !id.endsWith("security-specialist"))) {
  if (!engineering.agents.some((a) => a.id === id))
    throw Error("Engineering registry identity changed; review reconciliation first.");
}
export const WORKFORCE_TEMPLATES: { slug: string; lead: boolean; config: WorkforceConfig }[] = [
  ...leads.map(([department, name, role]) => ({ department, name, role, lead: true })),
  ...engineers.map(([name, role]) => ({ department: "engineering", name, role, lead: false })),
].map((entry) => ({
  slug: (identities[entry.name!] ?? entry.name!).toLowerCase(),
  lead: entry.lead,
  config: workforceConfig.parse({
    name: entry.name,
    department: entry.department,
    role: entry.role,
    description: `Private ${entry.role!.toLowerCase()} for authorized project work.`,
    instructions: `Work as the ${entry.role}. Clarify the goal, produce evidence-based recommendations and identify uncertainties. Use only authorized capabilities, preserve existing resources and report actual results. Never claim external execution without a tool receipt.`,
  }),
}));
