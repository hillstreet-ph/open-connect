import type { SupabaseClient } from "@supabase/supabase-js";
import { mergedReviewConfig } from "./resource-approval.ts";
import { reviewUpdate, type ReviewAction } from "./resource-review-bulk.ts";

export type ReviewSnapshot = {
  id: string;
  verified: boolean;
  published: boolean;
  installation_config: unknown;
  updated_at: string;
};

/** Compare-and-swap: a concurrent review or configuration edit must win. */
export async function writeResourceReview(
  client: SupabaseClient,
  resource: ReviewSnapshot,
  action: ReviewAction,
  updatedAt: string,
) {
  const scan = (resource.installation_config as { scan_report?: { state?: string } } | null)
    ?.scan_report;
  if (["verify", "publish", "verify_publish"].includes(action) && scan?.state === "blocked")
    throw new Error(
      "Resolve the blocked package findings and rescan before verification or publication",
    );
  const { data, error } = await client
    .from("resources")
    .update({
      ...reviewUpdate(action),
      installation_config: mergedReviewConfig(resource, action),
      updated_at: updatedAt,
    })
    .eq("id", resource.id)
    .eq("updated_at", resource.updated_at)
    .select("id, name, verified, published")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as { id: string; name: string; verified: boolean; published: boolean } | null;
}
