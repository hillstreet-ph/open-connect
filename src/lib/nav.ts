/**
 * Site structure — public marketing vs signed-in workspace.
 * Public: LobeHub-style discovery. Workspace: Studio, orgs, roles.
 */

export type NavLink = {
  to: string;
  label: string;
  description?: string;
  capability?: "manage_toolkits";
};

export type NavCategory = {
  id: string;
  label: string;
  items: NavLink[];
};

export const publicCategories: NavCategory[] = [
  {
    id: "products",
    label: "Products",
    items: [{ to: "/resources", label: "Marketplace", description: "Agents, MCP, skills" }],
  },
  {
    id: "workspace",
    label: "Workspace",
    items: [
      { to: "/auth", label: "Sign in", description: "Open your hub" },
      { to: "/dashboard", label: "Dashboard", description: "After login" },
    ],
  },
];

export const workspaceCapabilities = [
  {
    to: "/library",
    label: "Resources",
    description: "Browse your saved skills, tools, and agent packages.",
  },
  {
    to: "/connections",
    label: "Connections",
    description: "Manage connected accounts, tools, and permissions.",
  },
  { to: "/models", label: "Models", description: "Choose AI providers, models, and model keys." },
  {
    to: "/secrets",
    label: "Credentials",
    description: "Manage saved credentials and secure references.",
  },
] as const;

export const appCategories: NavCategory[] = [
  {
    id: "workspace",
    label: "Workspace",
    items: [
      { to: "/dashboard", label: "Dashboard" },
      { to: "/projects", label: "Projects" },
    ],
  },
  {
    id: "work",
    label: "Work",
    items: [
      { to: "/studio", label: "Studio" },
      { to: "/tasks", label: "Task" },
      { to: "/schedule", label: "Schedules" },
      { to: "/automations", label: "Automations" },
    ],
  },
  {
    id: "discover",
    label: "Discover",
    items: [{ to: "/resources", label: "Marketplace" }],
  },
  {
    id: "cloud",
    label: "Cloud",
    items: [
      { to: "/cloud-phone", label: "Cloud Phone" },
      { to: "/cloud-browser", label: "Cloud Browser" },
      { to: "/cloud-terminal", label: "Cloud Terminal" },
      { to: "/cloud-computer", label: "Cloud Computer" },
    ],
  },
  {
    id: "capabilities",
    label: "Capabilities",
    items: workspaceCapabilities.map((item) => ({ ...item })),
  },
];

export function flatPublicNav(): NavLink[] {
  return [{ to: "/resources", label: "Marketplace" }];
}

export function flatAppNav(): NavLink[] {
  return appCategories.flatMap((category) => category.items);
}

export const resourceCategories = [
  { value: "all", label: "All" },
  { value: "skill", label: "Skills" },
  { value: "mcp", label: "MCP" },
  { value: "tool", label: "Tools" },
  { value: "plugin", label: "Plugins" },
  { value: "agent", label: "Agents" },
  { value: "prompt", label: "Prompts" },
  { value: "toolkit", label: "Toolkits" },
  { value: "other", label: "Others" },
] as const;

export const connectionCategories = [
  "AI",
  "Communication",
  "Development",
  "Productivity",
  "Infrastructure",
  "Data",
  "Business",
  "Automation",
  "Security",
] as const;
