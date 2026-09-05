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
      { to: "/connections", label: "Connections", description: "Slack, GitHub, apps" },
      { to: "/models", label: "Models", description: "OpenAI-compatible /v1" },
      { to: "/integrations", label: "Open WebUI & clients", description: "ChatGPT, Claude, Grok" },
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
      { to: "/orgs", label: "Organizations", description: "Orgs and projects" },
      { to: "/agents", label: "Agents", description: "MCP agents and keys" },
      { to: "/guides", label: "Professional setup", description: "E2E guides" },
    ],
  },
  {
    id: "catalog",
    label: "Catalog",
    items: [
      { to: "/resources", label: "Marketplace", description: "Download skills" },
      { to: "/connections", label: "Connections", description: "Link apps" },
      { to: "/models", label: "Models", description: "Gateway models" },
      { to: "/toolkits", label: "Toolkits", description: "Developer+" },
    ],
  },
  {
    id: "security",
    label: "Security",
    items: [
      { to: "/api-keys", label: "API Keys", description: "oc_live_ scopes" },
      { to: "/secrets", label: "Secrets", description: "Credential vault" },
      { to: "/settings", label: "Settings", description: "Role & profile" },
    ],
  },
];

export function flatPublicNav(): NavLink[] {
  return [
    { to: "/resources", label: "Marketplace" },
    { to: "/connections", label: "Connections" },
    { to: "/models", label: "Models" },
    { to: "/integrations", label: "Integrations" },
  ];
}

export function flatAppNav(): NavLink[] {
  return [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/studio", label: "Studio" },
    { to: "/orgs", label: "Orgs" },
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
