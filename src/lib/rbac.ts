import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

/** Higher index = more privilege. owner supersedes all. */
export const ROLE_RANK: Record<AppRole, number> = {
  user: 1,
  developer: 2,
  publisher: 3,
  admin: 4,
  owner: 5,
};

export const ALL_ROLES: AppRole[] = ["user", "developer", "publisher", "admin", "owner"];

export type Capability =
  | "dashboard"
  | "studio"
  | "orgs"
  | "guides"
  | "api_keys"
  | "connections"
  | "download_resources"
  | "upload_resources"
  | "secrets"
  | "manage_toolkits"
  | "publish_resources"
  | "verify_resources"
  | "manage_roles"
  | "admin_panel";

/** Minimum role required for each capability */
export const CAPABILITY_MIN_ROLE: Record<Capability, AppRole> = {
  dashboard: "user",
  studio: "user",
  orgs: "user",
  guides: "user",
  api_keys: "user",
  connections: "user",
  download_resources: "user",
  upload_resources: "user",
  secrets: "user",
  manage_toolkits: "developer",
  publish_resources: "publisher",
  verify_resources: "admin",
  manage_roles: "admin",
  admin_panel: "admin",
};

/** Human-readable role matrix for workspace UI */
export const ROLE_SCOPE_MATRIX: {
  role: AppRole;
  summary: string;
  can: string[];
}[] = [
  {
    role: "user",
    summary: "Client workspace — download, upload, keys, agents, orgs, full API surface",
    can: [
      "Dashboard · Studio · Organizations",
      "Download / view marketplace skills",
      "Upload packages (own)",
      "API keys (full autonomous scopes)",
      "Agents · Connections · Secrets",
      "Guides & professional E2E setup",
    ],
  },
  {
    role: "developer",
    summary: "Everything user has, plus toolkits",
    can: ["Manage toolkits", "Bundle capabilities for agents"],
  },
  {
    role: "publisher",
    summary: "Marketplace publishing controls",
    can: ["Publish resources to catalog", "Featured package workflow"],
  },
  {
    role: "admin",
    summary: "Verify packages and manage roles",
    can: ["Verify resources", "Manage roles", "Admin panel"],
  },
  {
    role: "owner",
    summary: "Full platform control",
    can: ["All admin capabilities", "Owner supersedes every role"],
  },
];

/** Agent / API key scopes (oc_live_ keys) — auto-granted on create */
export const KEY_SCOPE_DOCS: { scope: string; meaning: string }[] = [
  { scope: "openid", meaning: "OIDC identity for OAuth MCP clients" },
  { scope: "mcp:connect", meaning: "Call MCP tools/list and tools/call at /mcp" },
  { scope: "resources:read", meaning: "Read marketplace catalog via MCP/API" },
  { scope: "resources:write", meaning: "Upload / manage own packages" },
  { scope: "connections:read", meaning: "List app capability grants" },
  { scope: "connections:invoke", meaning: "Invoke Pipedream / Composio / connected apps server-side" },
  { scope: "models:read", meaning: "List models and probe /v1" },
  { scope: "models:invoke", meaning: "POST /v1/chat/completions (LiteLLM / OpenRouter)" },
  { scope: "tools:invoke", meaning: "Run tools, browser skills, MultiOn orchestration" },
  { scope: "secrets:read", meaning: "Resolve vault references for agents (server-side only)" },
  { scope: "agents:invoke", meaning: "Run agent sessions and toolkits" },
];

export function highestRole(roles: AppRole[]): AppRole {
  if (!roles.length) return "user";
  return roles.reduce((best, r) => (ROLE_RANK[r] > ROLE_RANK[best] ? r : best), roles[0]!);
}

export function hasRole(roles: AppRole[], required: AppRole): boolean {
  return roles.some((r) => ROLE_RANK[r] >= ROLE_RANK[required]);
}

export function can(roles: AppRole[], capability: Capability): boolean {
  return hasRole(roles, CAPABILITY_MIN_ROLE[capability]);
}

export function roleLabel(role: AppRole): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}
