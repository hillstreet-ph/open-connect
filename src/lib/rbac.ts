import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

/** Higher index = more privilege. Legacy Owner and Publisher values are converted during migration. */
export const ROLE_RANK: Record<AppRole, number> = {
  user: 1,
  developer: 2,
  publisher: 3,
  admin: 4,
  owner: 5,
};

export const ALL_ROLES: AppRole[] = ["user", "developer", "admin"];
export const LEGACY_ROLES: AppRole[] = ["publisher", "owner"];

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
  publish_resources: "developer",
  verify_resources: "developer",
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
    summary:
      "Standard signed-in access to the workspace, personal resources, and assigned organization and project areas",
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
    summary:
      "Everything a Member has, plus toolkit management, resource publishing, and resource verification",
    can: [
      "Manage toolkits",
      "Bundle capabilities for agents",
      "Publish marketplace resources",
      "Verify marketplace resources",
    ],
  },
  {
    role: "admin",
    summary:
      "Everything a Developer can do, plus manage platform roles and access system administration",
    can: ["Manage roles", "Admin panel"],
  },
];

/** Agent / API key scopes (oc_live_ keys) — auto-granted on create */
export const KEY_SCOPE_DOCS: { scope: string; meaning: string }[] = [
  { scope: "openid", meaning: "OIDC identity for OAuth MCP clients" },
  { scope: "mcp:connect", meaning: "Call MCP tools/list and tools/call at /mcp" },
  { scope: "resources:read", meaning: "Read marketplace catalog via MCP/API" },
  { scope: "resources:write", meaning: "Upload / manage own packages" },
  { scope: "connections:read", meaning: "List app capability grants" },
  {
    scope: "connections:invoke",
    meaning: "Invoke Pipedream / Composio / connected apps server-side",
  },
  { scope: "models:read", meaning: "List models and probe /v1" },
  { scope: "models:invoke", meaning: "POST /v1/chat/completions (LiteLLM / OpenRouter)" },
  { scope: "tools:invoke", meaning: "Run tools, browser skills, MultiOn orchestration" },
  { scope: "secrets:read", meaning: "Resolve vault references for agents (server-side only)" },
  { scope: "agents:invoke", meaning: "Run agent sessions and toolkits" },
  {
    scope: "control:write",
    meaning: "Run Admin-authorized control operations with policy gates",
  },
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
  if (role === "user") return "Member";
  if (role === "owner") return "Admin";
  if (role === "publisher") return "Developer";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

/** UI mirrors existing server revoke rules; the server remains authoritative. */
export function canRevokeRole(
  roles: AppRole[],
  actorId: string,
  targetId: string,
  targetRole: AppRole,
): boolean {
  if (!hasRole(roles, "admin")) return false;
  if (actorId === targetId && targetRole === "admin") return false;
  return true;
}
