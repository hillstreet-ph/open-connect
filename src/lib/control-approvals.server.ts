import type { SupabaseClient } from "@supabase/supabase-js";

export type ApprovalDecision = "approved" | "denied";

/** Decide only the caller's live request. The conditional update prevents replay. */
export async function decideControlApproval(
  db: SupabaseClient,
  userId: string,
  approvalId: string,
  decision: ApprovalDecision,
  confirm: boolean,
) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(approvalId))
    throw new Error("A valid approval_id is required.");
  if (decision !== "approved" && decision !== "denied")
    throw new Error("Decision must be approved or denied.");
  if (confirm !== true) throw new Error("Explicit confirm=true is required for this decision.");
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("control_approvals")
    .update({ state: decision, decided_by: userId, decided_at: now })
    .eq("id", approvalId)
    .eq("tenant_id", userId)
    .eq("requested_by", userId)
    .eq("state", "pending")
    .gt("expires_at", now)
    .select("id,action,target,environment,state,expires_at,parameters_digest,decided_at")
    .maybeSingle();
  if (error) throw new Error("Could not record the approval decision.");
  if (!data)
    throw new Error("Approval unavailable, already decided, or expired. Prepare a new plan.");
  // Approval records authorization only. It must never fabricate execution evidence.
  return { ...data, execution_started: false };
}
