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
export const WORKFORCE_TEMPLATES: { slug: string; lead: boolean; config: WorkforceConfig }[] = [
  ...leads.map(([department, name, role]) => ({ department, name, role, lead: true })),
  ...engineers.map(([name, role]) => ({ department: "engineering", name, role, lead: false })),
].map((entry) => ({
  slug: entry.name!.toLowerCase(),
  lead: entry.lead,
  config: workforceConfig.parse({
    name: entry.name,
    department: entry.department,
    role: entry.role,
    description: `Private ${entry.role!.toLowerCase()} for authorized project work.`,
    instructions: `Work as the ${entry.role}. Clarify the goal, produce evidence-based recommendations and identify uncertainties. Use only authorized capabilities, preserve existing resources and report actual results. Never claim external execution without a tool receipt.`,
  }),
}));
