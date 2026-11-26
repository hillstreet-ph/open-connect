import { managedAccountId } from "./managed-mcp-policy.ts";

export type NotionRoutingContext = { projectId?: string | undefined; connectionId?: string | undefined };
type Binding = {
  project_id: string;
  connection_id: string;
  account_id: string;
  workspace: "kobeplay" | "justin_town";
};
const DENIED = "Notion routing is unavailable or this project/account is not approved.";
const token = (value: unknown): value is string =>
  typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value);

/** Optional deployment policy. IDs are server-owned bindings, never labels or emails. */
export function assertNotionProjectAccount(
  provider: string,
  reference: string,
  context?: NotionRoutingContext,
  raw = process.env["NOTION_PROJECT_ACCOUNT_BINDINGS"] ?? "",
): void {
  if (provider.toLowerCase() !== "notion" || raw === "") return;
  try {
    if (raw.length > 131072) throw new Error();
    const policy = JSON.parse(raw);
    if (!policy || policy.version !== 1 || policy.cross_workspace_sync !== false ||
        !Array.isArray(policy.bindings) || policy.bindings.length < 1 || policy.bindings.length > 1000) throw new Error();
    const projects = new Set<string>();
    const accounts = new Map<string, string>();
    const connections = new Map<string, string>();
    const workspaces = new Map<string, string>();
    for (const value of policy.bindings) {
      if (!value || !token(value.project_id) || !token(value.connection_id) || !token(value.account_id) ||
          !["kobeplay", "justin_town"].includes(value.workspace)) throw new Error();
      const binding = value as Binding;
      if (projects.has(binding.project_id)) throw new Error();
      projects.add(binding.project_id);
      if (accounts.has(binding.account_id) && accounts.get(binding.account_id) !== binding.workspace) throw new Error();
      accounts.set(binding.account_id, binding.workspace);
      const identity = binding.account_id + ":" + binding.workspace;
      if (connections.has(binding.connection_id) && connections.get(binding.connection_id) !== identity) throw new Error();
      connections.set(binding.connection_id, identity);
      if (workspaces.has(binding.workspace) && workspaces.get(binding.workspace) !== binding.account_id) throw new Error();
      workspaces.set(binding.workspace, binding.account_id);
    }
    if (!context?.projectId || !context.connectionId) throw new Error();
    const binding = (policy.bindings as Binding[]).find(value => value.project_id === context.projectId);
    if (!binding || binding.connection_id !== context.connectionId || binding.account_id !== managedAccountId(reference)) throw new Error();
  } catch {
    // Never include the mapping, credential reference, project or identity in errors.
    throw new Error(DENIED);
  }
}
