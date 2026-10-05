import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const COLLECTION_PREFIX = "collection-";

type CollectionContext = { supabase: SupabaseClient<Database>; userId: string };

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "collection"
  );
}

function resourceIds(input: string[] | undefined) {
  const ids = [...new Set(Array.isArray(input) ? input.filter(Boolean) : [])];
  if (ids.length > 100) {
    throw new Error("Select no more than 100 resources at a time.");
  }
  return ids;
}

function projectIds(input: string[] | undefined) {
  const ids = [...new Set(Array.isArray(input) ? input.filter(Boolean) : [])];
  if (ids.length > 50) {
    throw new Error("Select no more than 50 projects at a time.");
  }
  return ids;
}

async function verifyLibraryResources(context: CollectionContext, ids: string[]) {
  if (!ids.length) return;
  const installed = new Set<string>();
  const { data: library, error: libraryError } = await context.supabase
    .from("toolkits")
    .select("id")
    .eq("user_id", context.userId)
    .eq("slug", "open-connect-personal-library")
    .maybeSingle();
  if (libraryError) throw new Error(libraryError.message);
  if (library?.id) {
    const { data, error } = await context.supabase
      .from("toolkit_items")
      .select("resource_id")
      .eq("toolkit_id", library.id)
      .in("resource_id", ids);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) installed.add(row.resource_id);
  }
  const { data: owned, error } = await context.supabase
    .from("resources")
    .select("id")
    .eq("owner_id", context.userId)
    .in("id", ids);
  if (error) throw new Error(error.message);
  for (const row of owned ?? []) installed.add(row.id);
  const unavailable = ids.filter((id) => !installed.has(id));
  if (unavailable.length) throw new Error("Some selected resources are no longer in your library.");
}

async function ownedCollection(context: CollectionContext, id: string) {
  const { data, error } = await context.supabase
    .from("toolkits")
    .select("id")
    .eq("id", id)
    .eq("user_id", context.userId)
    .like("slug", "collection-%")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Collection not found.");
  return data.id as string;
}

export const listAssignableProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [
      { data: projects, error: projectError },
      { data: orgRoles, error: orgError },
      { data: memberships, error: membershipError },
    ] = await Promise.all([
        context.supabase.from("projects").select("id, name, organization_id"),
        context.supabase
          .from("organization_members")
          .select("organization_id")
          .eq("user_id", context.userId)
          .eq("role", "admin"),
        context.supabase
          .from("project_members")
          .select("project_id")
          .eq("user_id", context.userId)
          .eq("role", "manager"),
      ]);
    if (projectError) throw new Error(projectError.message);
    if (orgError) throw new Error(orgError.message);
    if (membershipError) throw new Error(membershipError.message);
    const managedOrganizations = new Set((orgRoles ?? []).map((row) => row.organization_id));
    const managedProjects = new Set((memberships ?? []).map((row) => row.project_id));
    return (projects ?? []).filter(
      (project) =>
        managedOrganizations.has(project.organization_id) || managedProjects.has(project.id),
    );
  });

export const listResourceCollections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("toolkits")
      .select(
        "id, name, description, created_at, toolkit_items(id, resource_id, resources(id, name, resource_type))",
      )
      .eq("user_id", context.userId)
      .like("slug", "collection-%")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createResourceCollection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { name: string; resourceIds?: string[] }) => ({
    name: (input?.name ?? "").trim().slice(0, 80),
    resourceIds: resourceIds(input?.resourceIds),
  }))
  .handler(async ({ data, context }) => {
    if (!data.name) throw new Error("Enter a collection name.");
    await verifyLibraryResources(context, data.resourceIds);
    const suffix = Math.random().toString(36).slice(2, 7);
    const { data: collection, error } = await context.supabase
      .from("toolkits")
      .insert({
        user_id: context.userId,
        name: data.name,
        slug: `${COLLECTION_PREFIX}${slugify(data.name)}-${suffix}`,
        description: "Resource collection",
        published: false,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    if (data.resourceIds.length) {
      const { error: itemError } = await context.supabase.from("toolkit_items").insert(
        data.resourceIds.map((resourceId, position) => ({
          toolkit_id: collection.id,
          resource_id: resourceId,
          position,
        })),
      );
      if (itemError) {
        await context.supabase.from("toolkits").delete().eq("id", collection.id);
        throw new Error(itemError.message);
      }
    }
    return { id: collection.id };
  });

export const addResourcesToCollection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { collectionId: string; resourceIds: string[] }) => ({
    collectionId: input?.collectionId ?? "",
    resourceIds: resourceIds(input?.resourceIds),
  }))
  .handler(async ({ data, context }) => {
    if (!data.collectionId || !data.resourceIds.length) {
      throw new Error("Select a collection and at least one resource.");
    }
    await ownedCollection(context, data.collectionId);
    await verifyLibraryResources(context, data.resourceIds);
    const { error } = await context.supabase.from("toolkit_items").upsert(
      data.resourceIds.map((resourceId, position) => ({
        toolkit_id: data.collectionId,
        resource_id: resourceId,
        position,
      })),
      { onConflict: "toolkit_id,resource_id" },
    );
    if (error) throw new Error(error.message);
    return { added: data.resourceIds.length };
  });

export const removeResourceFromCollection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { collectionId: string; resourceId: string }) => ({
    collectionId: input?.collectionId ?? "",
    resourceId: input?.resourceId ?? "",
  }))
  .handler(async ({ data, context }) => {
    if (!data.collectionId || !data.resourceId) {
      throw new Error("Collection and resource required.");
    }
    await ownedCollection(context, data.collectionId);
    const { error } = await context.supabase
      .from("toolkit_items")
      .delete()
      .eq("toolkit_id", data.collectionId)
      .eq("resource_id", data.resourceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteResourceCollection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { collectionId: string }) => ({
    collectionId: input?.collectionId ?? "",
  }))
  .handler(async ({ data, context }) => {
    await ownedCollection(context, data.collectionId);
    const { error } = await context.supabase
      .from("toolkits")
      .delete()
      .eq("id", data.collectionId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const assignResourcesToProjects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { resourceIds: string[]; projectIds: string[] }) => ({
    resourceIds: resourceIds(input?.resourceIds),
    projectIds: projectIds(input?.projectIds),
  }))
  .handler(async ({ data, context }) => {
    if (!data.resourceIds.length || !data.projectIds.length) {
      throw new Error("Select resources and projects.");
    }
    await verifyLibraryResources(context, data.resourceIds);
    const totalLinks = data.projectIds.length * data.resourceIds.length;
    if (totalLinks > 500) {
      throw new Error("This assignment is too large. Select fewer resources or projects.");
    }
    const links = data.projectIds.flatMap((projectId) =>
      data.resourceIds.map((resourceId) => ({
        project_id: projectId,
        resource_id: resourceId,
        added_by: context.userId,
      })),
    );
    const { error } = await context.supabase.from("project_resources").upsert(links, {
      onConflict: "project_id,resource_id",
    });
    if (error) throw new Error(error.message);
    return { assigned: links.length };
  });
