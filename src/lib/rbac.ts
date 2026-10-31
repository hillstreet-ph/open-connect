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

export type CapabilityGroup = "Workspace" | "Resources" | "Administration";

/** Canonical capability catalog: label + group for the access matrix. */
export const CAPABILITY_DOCS: { id: Capability; label: string; group: CapabilityGroup }[] = [
  { id: "dashboard", label: "Dashboard & Studio", group: "Workspace" },
  { id: "orgs", label: "Organization & projects", group: "Workspace" },
  { id: "api_keys", label: "API keys", group: "Workspace" },
  { id: "connections", label: "Connections & secrets (metadata)", group: "Workspace" },
  { id: "download_resources", label: "Download marketplace packages", group: "Resources" },
  { id: "upload_resources", label: "Upload own packages", group: "Resources" },
  { id: "manage_toolkits", label: "Manage toolkits", group: "Resources" },
  { id: "publish_resources", label: "Publish resources", group: "Resources" },
  { id: "verify_resources", label: "Verify resources", group: "Resources" },
  { id: "manage_roles", label: "Manage platform roles", group: "Administration" },
  { id: "admin_panel", label: "System administration", group: "Administration" },
];

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

/** Canonical one-line summary for each platform role. */
export const PLATFORM_ROLE_SUMMARY: Record<AppRole, string> = {
  user: "Standard signed-in access to the workspace, personal resources, and assigned organization and project areas",
  developer:
    "Everything a Member has, plus toolkit management, resource publishing, and resource verification",
  publisher:
    "Legacy Developer-level access. Migrated to Developer; no longer offered for new assignments.",
  admin:
    "Everything a Developer can do, plus managing platform roles and using system administration",
  owner: "Legacy Admin-level access. Migrated to Admin; no longer offered for new assignments.",
};

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

/** Access level for one role/capability pair, derived from CAPABILITY_MIN_ROLE. */
export function capabilityLevel(role: AppRole, capability: Capability): "full" | "denied" {
  return hasRole([role], CAPABILITY_MIN_ROLE[capability]) ? "full" : "denied";
}

export function roleLabel(role: AppRole): string {
  if (role === "user") return "Member";
  if (role === "owner") return "Admin";
  if (role === "publisher") return "Developer";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

/** Collapse legacy platform values onto the canonical assignable role for UI selection. */
export function canonicalAppRole(role: AppRole): AppRole {
  if (role === "owner") return "admin";
  if (role === "publisher") return "developer";
  return role;
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
