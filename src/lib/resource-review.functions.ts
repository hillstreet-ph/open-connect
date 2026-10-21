import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasRole, type AppRole } from "@/lib/rbac";
import {
  MAX_BULK_REVIEW,
  isReviewAction,
  normalizeBulkReviewInput,
  planBulkReview,
  reviewUpdate,
} from "@/lib/resource-review-bulk";

const ID_CHUNK = 200;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function requireResourceReviewer(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((row: { role: AppRole }) => row.role);
  if (!hasRole(roles, "developer")) throw new Error("Forbidden: Developer or Admin required");
}

export const listResourcesForReview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireResourceReviewer(context.supabase, context.userId);
    const { data, error } = await supabaseAdmin
      .from("resources")
      .select(
        "id, slug, name, description, resource_type, source, source_url, repository_url, version, license, verified, published, created_at",
      )
      .or("published.eq.false,verified.eq.false")
      .order("created_at", { ascending: false })
      .limit(MAX_BULK_REVIEW);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const updateResourceReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string; action: string }) => ({
    id: (input?.id ?? "").trim(),
    action: (input?.action ?? "").trim(),
  }))
  .handler(async ({ data, context }) => {
    await requireResourceReviewer(context.supabase, context.userId);
    if (!data.id) throw new Error("Resource id is required");
    if (!isReviewAction(data.action)) throw new Error("Choose a valid resource review action");

    const { data: resource, error: readError } = await supabaseAdmin
      .from("resources")
      .select("id, verified, published")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!resource) throw new Error("Resource not found");
    if (data.action === "publish" && !resource.verified) {
      throw new Error("Verify this resource before publishing it");
    }

    const { data: updated, error } = await supabaseAdmin
      .from("resources")
      .update({ ...reviewUpdate(data.action), updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .select("id, name, verified, published")
      .single();
    if (error) throw new Error(error.message);
    return updated;
  });

/**
 * Applies one review action to many resources. Publishing still requires
 * verification: unverified rows are skipped, never published.
 */
export const bulkUpdateResourceReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { ids: string[]; action: string }) => normalizeBulkReviewInput(input))
  .handler(async ({ data, context }) => {
    await requireResourceReviewer(context.supabase, context.userId);

    const found: { id: string; verified: boolean; published: boolean }[] = [];
    for (const ids of chunk(data.ids, ID_CHUNK)) {
      const { data: rows, error } = await supabaseAdmin
        .from("resources")
        .select("id, verified, published")
        .in("id", ids);
      if (error) throw new Error(error.message);
      found.push(...(rows ?? []));
    }

    const plan = planBulkReview(found, data.action);
    const foundIds = new Set(found.map((row) => row.id));
    const missing = data.ids.filter((id) => !foundIds.has(id)).length;
    const now = new Date().toISOString();
    let updated = 0;
    for (const ids of chunk(plan.apply, ID_CHUNK)) {
      let query = supabaseAdmin
        .from("resources")
        .update({ ...reviewUpdate(data.action), updated_at: now })
        .in("id", ids);
      // Re-check verification at write time so a concurrent unverify wins.
      if (data.action === "publish") query = query.eq("verified", true);
      const { data: rows, error } = await query.select("id");
      if (error) throw new Error(error.message);
      updated += rows?.length ?? 0;
    }

    return {
      action: data.action,
      requested: data.ids.length,
      updated,
      skipped_not_verified: plan.skipped.filter((s) => s.reason === "not_verified").length,
      skipped_unchanged: plan.skipped.filter((s) => s.reason === "already_done").length,
      missing,
    };
  });
