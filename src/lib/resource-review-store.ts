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
