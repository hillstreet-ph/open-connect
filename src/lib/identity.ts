/**
 * Canonical identity helpers for Open Connect.
 * See docs/IDENTITY_MODEL.md
 *
 * Org roles:  owner | admin | member
 * Project:    manager | developer | viewer
 * Machine:    ai_client | ai_agent | service_account | api_client | mcp_client
 *
 * Legacy platform app_role (user/developer/publisher/admin/owner) remains for
 * route guards until full cutover — map product language via these helpers.
 */

export type OrgRole = "owner" | "admin" | "member";
export type ProjectRole = "manager" | "developer" | "viewer";
export type PrincipalType =
  | "human"
  | "ai_client"
  | "ai_agent"
  | "service_account"
  | "api_client"
  | "mcp_client";

export const ORG_ROLE_RANK: Record<OrgRole, number> = {
  member: 1,
  admin: 2,
  owner: 3,
};

export const PROJECT_ROLE_RANK: Record<ProjectRole, number> = {
  viewer: 1,
  developer: 2,
  manager: 3,
};

/** Map legacy app_role labels into org vocabulary for UI copy. */
export function appRoleToOrgRole(role: string): OrgRole {
  if (role === "owner") return "owner";
  if (role === "admin") return "admin";
  return "member";
}

export function hasOrgRole(roles: OrgRole[], required: OrgRole): boolean {
  return roles.some((r) => ORG_ROLE_RANK[r] >= ORG_ROLE_RANK[required]);
}

export function hasProjectRole(roles: ProjectRole[], required: ProjectRole): boolean {
  return roles.some((r) => PROJECT_ROLE_RANK[r] >= PROJECT_ROLE_RANK[required]);
}

export function highestOrgRole(roles: OrgRole[]): OrgRole {
  if (!roles.length) return "member";
  return roles.reduce((best, r) => (ORG_ROLE_RANK[r] > ORG_ROLE_RANK[best] ? r : best), roles[0]!);
}

export function highestProjectRole(roles: ProjectRole[]): ProjectRole {
  if (!roles.length) return "viewer";
  return roles.reduce(
    (best, r) => (PROJECT_ROLE_RANK[r] > PROJECT_ROLE_RANK[best] ? r : best),
    roles[0]!,
  );
}

/** Surfaces for permission-aware navigation (target IA). */
export type ProductSurface = "member_workspace" | "admin_console" | "owner_console";

export function surfacesForOrgRole(role: OrgRole): ProductSurface[] {
  if (role === "owner") return ["member_workspace", "admin_console", "owner_console"];
  if (role === "admin") return ["member_workspace", "admin_console"];
  return ["member_workspace"];
}

export const ORG_ROLE_LABEL: Record<OrgRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

export const PROJECT_ROLE_LABEL: Record<ProjectRole, string> = {
  manager: "Manager",
  developer: "Developer",
  viewer: "Viewer",
};
