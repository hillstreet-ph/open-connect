import type { SupabaseClient } from "@supabase/supabase-js";

/** Complete only the caller's still-running Agency proposal; never overwrite a terminal run. */
export async function finishAgencyProposalRun(
  db: SupabaseClient,
  userId: string,
  id: string,
  state: "succeeded" | "failed",
  evidence: Record<string, unknown>,
) {
  const { data, error } = await db
    .from("autonomous_runs")
    .update({
      state,
      updated_at: new Date().toISOString(),
      evidence: { ...evidence, executor: "ai_agency", execution_performed: false },
    })
    .eq("id", id)
    .eq("user_id", userId)
    .eq("state", "running")
    .contains("evidence", { executor: "ai_agency" })
    .select("id")
    .maybeSingle();
  if (error || !data)
    throw new Error(
      `Run ${id} could not be finalized. Check history before retrying; no completion was verified.`,
    );
}
