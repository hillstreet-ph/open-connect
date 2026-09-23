import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

const LIBRARY_SLUG = "open-connect-personal-library";

async function ensureLibrary(context: { supabase: SupabaseClient<Database>; userId: string }) {
  const { data: existing, error: readError } = await context.supabase
    .from("toolkits")
    .select("id")
    .eq("user_id", context.userId)
    .eq("slug", LIBRARY_SLUG)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (existing) return existing.id as string;
  const { data: created, error } = await context.supabase
    .from("toolkits")
    .insert({
      user_id: context.userId,
      slug: LIBRARY_SLUG,
      name: "Personal Library",
      description: "Resources added from Studio and Marketplace.",
      published: false,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return created.id as string;
}

export const listLibraryResources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input?: { resourceType?: string }) => ({
    resourceType: input?.resourceType ?? null,
  }))
  .handler(async ({ data, context }) => {
    const libraryId = await ensureLibrary(context);
    let installedQuery = context.supabase
      .from("toolkit_items")
      .select(
        "id, created_at, resources(id, name, slug, description, resource_type, version, verified, package_filename, package_size)",
      )
      .eq("toolkit_id", libraryId)
      .order("created_at", { ascending: false });
    let ownedQuery = context.supabase
      .from("resources")
      .select(
        "id, created_at, name, slug, description, resource_type, version, verified, package_filename, package_size",
      )
      .eq("owner_id", context.userId)
      .order("created_at", { ascending: false });
    if (data.resourceType) {
      installedQuery = installedQuery.eq("resources.resource_type", data.resourceType);
      ownedQuery = ownedQuery.eq("resource_type", data.resourceType as never);
    }
    const [installedResult, ownedResult] = await Promise.all([installedQuery, ownedQuery]);
    if (installedResult.error) throw new Error(installedResult.error.message);
    if (ownedResult.error) throw new Error(ownedResult.error.message);
    const installed = (installedResult.data ?? []) as unknown as Array<{
      id: string;
      created_at: string;
      resources: {
        id: string;
        name: string;
        slug: string;
        description: string | null;
        resource_type: string;
        version: string | null;
        verified: boolean;
        package_filename: string | null;
        package_size: number | null;
      } | null;
    }>;
    const byId = new Map(
      installed.flatMap((row) => (row.resources ? [[row.resources.id, row] as const] : [])),
    );
    for (const resource of ownedResult.data ?? []) {
      if (!byId.has(resource.id)) {
        byId.set(resource.id, {
          id: `owned-${resource.id}`,
          created_at: resource.created_at,
          resources: resource,
        });
      }
    }
    return Array.from(byId.values()).sort((a, b) => b.created_at.localeCompare(a.created_at));
  });

export const addResourceToLibrary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { resourceId: string }) => ({ resourceId: input?.resourceId ?? "" }))
  .handler(async ({ data, context }) => {
    if (!data.resourceId) throw new Error("resourceId required");
    const libraryId = await ensureLibrary(context);
    const { error } = await context.supabase
      .from("toolkit_items")
      .upsert(
        { toolkit_id: libraryId, resource_id: data.resourceId, position: 0 },
        { onConflict: "toolkit_id,resource_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeResourceFromLibrary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { resourceId: string }) => ({ resourceId: input?.resourceId ?? "" }))
  .handler(async ({ data, context }) => {
    const libraryId = await ensureLibrary(context);
    const { error } = await context.supabase
      .from("toolkit_items")
      .delete()
      .eq("toolkit_id", libraryId)
      .eq("resource_id", data.resourceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
