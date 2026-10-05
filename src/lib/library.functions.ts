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
    const { readWorkspaceLibrary } = await import("@/lib/workspace-library.server");
    return readWorkspaceLibrary(context, data.resourceType);
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

    const { data: collections, error: collectionsError } = await context.supabase
      .from("toolkits")
      .select("id")
      .eq("user_id", context.userId)
      .like("slug", "collection-%");
    if (collectionsError) throw new Error(collectionsError.message);
    const collectionIds = (collections ?? []).map((collection) => collection.id);
    if (collectionIds.length) {
      const { error: collectionItemsError } = await context.supabase
        .from("toolkit_items")
        .delete()
        .in("toolkit_id", collectionIds)
        .eq("resource_id", data.resourceId);
      if (collectionItemsError) throw new Error(collectionItemsError.message);
    }
    return { ok: true };
  });
