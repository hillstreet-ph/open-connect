/**
 * Site structure — public marketing vs signed-in workspace.
 * Public: LobeHub-style discovery. Workspace: Studio, orgs, roles.
 */

export type NavLink = {
  to: string;
  label: string;
  description?: string;
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
    items: [
      { to: "/resources", label: "Marketplace", description: "Agents, MCP, skills" },
      { to: "/models", label: "Models", description: "OpenAI-compatible /v1" },
    ],
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

export const appCategories: NavCategory[] = [
  {
    id: "workspace",
    label: "Workspace",
    items: [
      { to: "/dashboard", label: "Dashboard", description: "Hub overview" },
      { to: "/studio", label: "Studio", description: "Create agents & skills" },
      {
        to: "/campaign-studio",
        label: "Campaign Studio",
        description: "Concepts, copy, and visuals",
      },
      { to: "/memory", label: "Memory", description: "Project decisions and reusable context" },
      { to: "/knowledge", label: "Knowledge", description: "Project documents and sources" },
      { to: "/orgs", label: "Organization", description: "People, groups, and invitations" },
      { to: "/projects", label: "Workspaces", description: "Projects and environments" },
      { to: "/agents", label: "Agents", description: "MCP agents and keys" },
      { to: "/guides", label: "Professional setup", description: "E2E guides" },
    ],
  },
  {
    id: "catalog",
    label: "Catalog",
    items: [
      { to: "/resources", label: "Marketplace", description: "Download skills" },
      { to: "/connections", label: "Connectors", description: "Connect apps and custom MCP" },
      { to: "/models", label: "Models", description: "Gateway models" },
      { to: "/toolkits", label: "Toolkits", description: "Developer+" },
    ],
  },
  {
    id: "security",
    label: "Security",
    items: [
      { to: "/secrets", label: "Secrets", description: "Credential vault" },
      { to: "/settings", label: "Settings", description: "Role & profile" },
    ],
  },
];

export function flatPublicNav(): NavLink[] {
  return [
    { to: "/resources", label: "Marketplace" },
    { to: "/models", label: "Models" },
  ];
}

export function flatAppNav(): NavLink[] {
  return [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/studio", label: "Studio" },
    { to: "/campaign-studio", label: "Campaign Studio" },
    { to: "/memory", label: "Memory" },
    { to: "/knowledge", label: "Knowledge" },
    { to: "/orgs", label: "Organization" },
    { to: "/projects", label: "Workspaces" },
    { to: "/resources", label: "Marketplace" },
    { to: "/guides", label: "Setup" },
  ];
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
  { value: "memory", label: "Memory" },
  { value: "knowledge", label: "Knowledge" },
] as const;

export const connectionCategories = [
  "AI",
  "Communication",
  "Development",
  "Productivity",
  "Infrastructure",
  "Data",
  "Business",
] as const;
