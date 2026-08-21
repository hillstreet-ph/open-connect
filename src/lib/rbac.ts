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
  | "api_keys"
  | "connections"
  | "download_resources"
  | "upload_resources"
  | "manage_toolkits"
  | "publish_resources"
  | "verify_resources"
  | "manage_roles"
  | "admin_panel";

/** Minimum role required for each capability */
export const CAPABILITY_MIN_ROLE: Record<Capability, AppRole> = {
  dashboard: "user",
  api_keys: "user",
  connections: "user",
  download_resources: "user",
  upload_resources: "user",
  manage_toolkits: "developer",
  publish_resources: "publisher",
  verify_resources: "admin",
  manage_roles: "admin",
  admin_panel: "admin",
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

export function roleLabel(role: AppRole): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}
