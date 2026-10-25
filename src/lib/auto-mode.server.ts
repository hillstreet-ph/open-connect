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
  return "Auto is on. Complete the user's authorized task without repeated discretionary confirmations. Use auto_discover when a capability is needed, match catalog metadata to tools actually available in the host, and verify the provider before claiming access. Never treat catalog matches as executed tools. Reuse authorized connectors and secure credential references; never expose secrets. Respect host approvals, provider consent, and account scopes. Use run_agent_team for bounded planning, building proposals, and review on connected catalog-verified free models. Workers do not execute external actions. Before context becomes too long, use save_context_checkpoint with a concise redacted summary and session_id; resume with list_my_memory checkpoint_session. Never claim control over the host conversation compactor or click host approval prompts. For multi-step work, use plan_goal and, when control:write is granted, execute_plan to obtain a correlation_id. A stored plan is not evidence of execution: use available authorized tools and verify their results. Protected plans retain their approval requirements. After a verified autonomous run, call record_run_outcome to save redacted learning and prepare private drafts from repeated successful procedures; inspect and verify drafts before any separate approval or publication.";
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
