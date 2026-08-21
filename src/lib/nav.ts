/**
 * Single source of truth for site structure.
 * Keep menus short and category-based for desktop + mobile.
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

/** Public marketing site — discovery only */
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
      { to: "/integrations", label: "Integrations", description: "ChatGPT, Grok, Telegram, MCP" },
    ],
  },
];

/** Signed-in workspace — product surfaces */
export const appCategories: NavCategory[] = [
  {
    id: "workspace",
    label: "Workspace",
    items: [
      { to: "/dashboard", label: "Dashboard", description: "Overview and uploads" },
      { to: "/agents", label: "Agents", description: "MCP agents and keys" },
      { to: "/toolkits", label: "Toolkits", description: "Bundled capabilities" },
    ],
  },
  {
    id: "catalog",
    label: "Catalog",
    items: [
      { to: "/resources", label: "Marketplace", description: "Browse and download packages" },
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
      { to: "/integrations", label: "Integrations", description: "Client setup guides" },
    ],
  },
];

/** Flat top-bar links (desktop) — keep ≤ 5–6 visible */
export function flatPublicNav(): NavLink[] {
  return publicCategories.flatMap((c) => c.items);
}

export function flatAppNav(): NavLink[] {
  return [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/agents", label: "Agents" },
    { to: "/resources", label: "Marketplace" },
    { to: "/connections", label: "Connections" },
    { to: "/models", label: "Models" },
  ];
}

/** Resource marketplace type filters */
export const resourceCategories = [
  { value: "all", label: "All" },
  { value: "skill", label: "Skills" },
  { value: "mcp", label: "MCP" },
  { value: "tool", label: "Tools" },
  { value: "plugin", label: "Plugins" },
  { value: "agent", label: "Agents" },
  { value: "prompt", label: "Prompts" },
  { value: "guide", label: "Guides" },
] as const;

/** Connection provider categories (display grouping) */
export const connectionCategories = [
  "AI",
  "Communication",
  "Development",
  "Productivity",
  "Infrastructure",
  "Data",
  "Business",
] as const;
