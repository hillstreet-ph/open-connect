import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasRole, type AppRole } from "@/lib/rbac";

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
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const updateResourceReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string; action: string }) => ({
    id: (input?.id ?? "").trim(),
    action: (input?.action ?? "").trim() as "verify" | "unverify" | "publish" | "unpublish",
  }))
  .handler(async ({ data, context }) => {
    await requireResourceReviewer(context.supabase, context.userId);
    if (!data.id) throw new Error("Resource id is required");
    if (!["verify", "unverify", "publish", "unpublish"].includes(data.action)) {
      throw new Error("Choose a valid resource review action");
    }

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

    const update =
      data.action === "verify"
        ? { verified: true }
        : data.action === "unverify"
          ? { verified: false, published: false }
          : data.action === "publish"
            ? { published: true }
            : { published: false };
    const { data: updated, error } = await supabaseAdmin
      .from("resources")
      .update({ ...update, updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .select("id, name, verified, published")
      .single();
    if (error) throw new Error(error.message);
    return updated;
  });
