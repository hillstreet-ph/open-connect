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

async function ensureSkillsCollection(context: {
  supabase: SupabaseClient<Database>;
  userId: string;
}) {
  const { data: existing, error: readError } = await context.supabase
    .from("toolkits")
    .select("id")
    .eq("user_id", context.userId)
    .eq("name", "Skills")
    .like("slug", "collection-%")
    .limit(1)
    .maybeSingle();
  if (readError) throw new Error(readError.message);

  let collectionId = existing?.id as string | undefined;
  if (!collectionId) {
    const slug = `collection-skills-${context.userId.replaceAll("-", "").slice(0, 12)}`;
    const { data: created, error } = await context.supabase
      .from("toolkits")
      .insert({
        user_id: context.userId,
        slug,
        name: "Skills",
        description: "Skill resources installed from Marketplace.",
        published: false,
      })
      .select("id")
      .single();

    collectionId = created?.id as string | undefined;
    if (error) {
      const { data: concurrent, error: concurrentError } = await context.supabase
        .from("toolkits")
        .select("id")
        .eq("user_id", context.userId)
        .eq("slug", slug)
        .maybeSingle();
      if (concurrentError) throw new Error(concurrentError.message);
      if (!concurrent) throw new Error(error.message);
      collectionId = concurrent.id as string;
    }
  }

  if (!collectionId) throw new Error("Could not create Skills collection.");
  const libraryId = await ensureLibrary(context);
  const { data: installedSkills, error: skillsError } = await context.supabase
    .from("toolkit_items")
    .select("resource_id, resources!inner(resource_type)")
    .eq("toolkit_id", libraryId)
    .eq("resources.resource_type", "skill");
  if (skillsError) throw new Error(skillsError.message);

  if (installedSkills?.length) {
    const { error: backfillError } = await context.supabase.from("toolkit_items").upsert(
      installedSkills.map((item, position) => ({
        toolkit_id: collectionId,
        resource_id: item.resource_id,
        position,
      })),
      { onConflict: "toolkit_id,resource_id" },
    );
    if (backfillError) throw new Error(backfillError.message);
  }
  return collectionId;
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
  .validator((input: { resourceId: string; collectionId?: string | null }) => ({
    resourceId: input?.resourceId ?? "",
    collectionId: input?.collectionId ?? null,
  }))
  .handler(async ({ data, context }) => {
    if (!data.resourceId) throw new Error("resourceId required");
    const { data: resource, error: resourceError } = await context.supabase
      .from("resources")
      .select("resource_type")
      .eq("id", data.resourceId)
      .maybeSingle();
    if (resourceError) throw new Error(resourceError.message);
    if (!resource) throw new Error("Resource not found.");

    let collectionId: string | null = null;
    if (resource.resource_type === "skill") {
      collectionId = await ensureSkillsCollection(context);
    } else if (data.collectionId) {
      const { data: collection, error: collectionError } = await context.supabase
        .from("toolkits")
        .select("id")
        .eq("id", data.collectionId)
        .eq("user_id", context.userId)
        .like("slug", "collection-%")
        .maybeSingle();
      if (collectionError) throw new Error(collectionError.message);
      if (!collection) throw new Error("Collection not found.");
      const { data: currentItems, error: itemsError } = await context.supabase
        .from("toolkit_items")
        .select("resource_id")
        .eq("toolkit_id", collection.id);
      if (itemsError) throw new Error(itemsError.message);
      const existingIds = new Set((currentItems ?? []).map((item) => item.resource_id));
      if (!existingIds.has(data.resourceId) && existingIds.size >= 100) {
        throw new Error("This collection already contains 100 resources.");
      }
      collectionId = collection.id;
    }

    const libraryId = await ensureLibrary(context);
    const { error } = await context.supabase
      .from("toolkit_items")
      .upsert(
        { toolkit_id: libraryId, resource_id: data.resourceId, position: 0 },
        { onConflict: "toolkit_id,resource_id" },
      );
    if (error) throw new Error(error.message);
    if (collectionId) {
      const { error: itemError } = await context.supabase
        .from("toolkit_items")
        .upsert(
          { toolkit_id: collectionId, resource_id: data.resourceId, position: 0 },
          { onConflict: "toolkit_id,resource_id" },
        );
      if (itemError) throw new Error(itemError.message);
    }
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

export const listResourceProjectAssignments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("project_resources")
      .select("resource_id, project_id, projects(name)");
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      resourceId: row.resource_id,
      projectId: row.project_id,
      projectName: row.projects?.name ?? "Project",
    }));
  });
