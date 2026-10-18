import type { SupabaseClient } from "@supabase/supabase-js";

export type AutoContext = {
  userId: string;
  organizationId: string | null;
  workspaceId: string | null;
  projectId: string | null;
};

export function autoScopeKey(key: AutoContext) {
  return key.projectId
    ? `project:${key.projectId}`
    : key.workspaceId
      ? `workspace:${key.workspaceId}`
      : key.organizationId
        ? `organization:${key.organizationId}`
        : "personal";
}

export function autoState(enabled: boolean | null, scope: string) {
  return {
    enabled,
    available: enabled !== null,
    scope,
    discovery: enabled === true,
    approval_policy: "host_and_provider_enforced",
    credentials: "metadata_only_until_secure_injection_verified",
  };
}

export function autoInstructions(enabled: boolean | null) {
  if (enabled !== true)
    return "Auto is off or unavailable. Use tools only as required by the user's explicit task. Respect host approvals and account scopes.";
  return "Auto is on. Complete the user's authorized task without repeated discretionary confirmations. Use auto_discover when a capability is needed, match catalog metadata to tools actually available in the host, and verify the provider before claiming access. Never treat catalog matches as executed tools. Reuse authorized connectors and secure credential references; never expose secrets. Respect host approvals, provider consent, and account scopes.";
}

export async function readAutoMode(db: SupabaseClient, key: AutoContext) {
  const scope = autoScopeKey(key);
  try {
    const { data, error } = await db
      .from("auto_preferences")
      .select("enabled")
      .eq("user_id", key.userId)
      .eq("scope_key", scope)
      .maybeSingle();
    if (error) return autoState(null, scope);
    return autoState(data?.enabled ?? true, scope);
  } catch {
    return autoState(null, scope);
  }
}

export async function writeAutoMode(db: SupabaseClient, key: AutoContext, enabled: unknown) {
  if (typeof enabled !== "boolean") throw new Error("enabled must be a boolean");
  const scope = autoScopeKey(key);
  const { data, error } = await db
    .from("auto_preferences")
    .upsert(
      { user_id: key.userId, scope_key: scope, enabled, updated_at: new Date().toISOString() },
      { onConflict: "user_id,scope_key" },
    )
    .select("enabled")
    .single();
  if (error || !data)
    throw new Error("Auto preference could not be saved. Retry after connecting.");
  return autoState(data.enabled, scope);
}
