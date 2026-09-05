/**
 * Site structure — public marketing vs signed-in workspace.
 * Public: discover only. Workspace: dashboard, uploads, keys, guides, roles.
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

/** Public marketing site — browse only (no downloads without login) */
export const publicCategories: NavCategory[] = [
  {
    id: "discover",
    label: "Discover",
    items: [
      { to: "/resources", label: "Marketplace", description: "Skills, tools, agents, prompts" },
      { to: "/connections", label: "Connections", description: "Apps and OAuth capabilities" },
      { to: "/models", label: "Models", description: "Multi-provider AI gateway" },
    ],
  },
  {
    id: "connect",
    label: "Connect",
    items: [
      { to: "/integrations", label: "Integrations", description: "How agents connect" },
      { to: "/auth", label: "Sign in", description: "Login to download and manage" },
    ],
  },
];

/** Signed-in workspace — product surfaces */
export const appCategories: NavCategory[] = [
  {
    id: "workspace",
    label: "Workspace",
    items: [
      { to: "/dashboard", label: "Dashboard", description: "Overview, uploads, role" },
      { to: "/agents", label: "Agents", description: "MCP agents and keys" },
      { to: "/toolkits", label: "Toolkits", description: "Bundled capabilities" },
      { to: "/guides", label: "Guides", description: "Setup and how-to docs" },
    ],
  },
  {
    id: "catalog",
    label: "Catalog",
    items: [
      { to: "/resources", label: "Marketplace", description: "Download skills and packages" },
      { to: "/connections", label: "Connections", description: "Link apps" },
      { to: "/models", label: "Models", description: "Gateway models" },
    ],
  },
  {
    id: "security",
    label: "Security",
    items: [
      { to: "/api-keys", label: "API Keys", description: "Scoped oc_live_ keys" },
      { to: "/secrets", label: "Secrets", description: "Credential vault" },
      { to: "/settings", label: "Settings", description: "Profile, password, role" },
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
    { to: "/agents", label: "Agents" },
    { to: "/resources", label: "Marketplace" },
    { to: "/connections", label: "Connections" },
    { to: "/guides", label: "Guides" },
  ];
}

/** Marketplace package types only — guides live under /guides workspace */
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
