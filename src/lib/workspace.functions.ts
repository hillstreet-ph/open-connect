import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Catalog items linked to a project workspace. */
export const listProjectResources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { projectId: string }) => ({
    projectId: input?.projectId ?? "",
  }))
  .handler(async ({ data, context }) => {
    if (!data.projectId) throw new Error("projectId required");
    const { data: rows, error } = await context.supabase
      .from("project_resources")
      .select(
        "id, project_id, resource_id, notes, created_at, resources(id, name, slug, resource_type, description, version, verified)",
      )
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const addResourceToProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { projectId: string; resourceId: string; notes?: string }) => ({
    projectId: input.projectId,
    resourceId: input.resourceId,
    notes: (input?.notes ?? "").trim() || null,
  }))
  .handler(async ({ data, context }) => {
    if (!data.projectId || !data.resourceId) throw new Error("project and resource required");
    const { data: library } = await context.supabase
      .from("toolkits")
      .select("id")
      .eq("user_id", context.userId)
      .eq("slug", "open-connect-personal-library")
      .maybeSingle();
    const [owned, installed] = await Promise.all([
      context.supabase
        .from("resources")
        .select("id")
        .eq("id", data.resourceId)
        .eq("owner_id", context.userId)
        .maybeSingle(),
      library?.id
        ? context.supabase
            .from("toolkit_items")
            .select("id")
            .eq("toolkit_id", library.id)
            .eq("resource_id", data.resourceId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (owned.error) throw new Error(owned.error.message);
    if (installed.error) throw new Error(installed.error.message);
    if (!owned.data && !installed.data) {
      throw new Error("Install this resource into your workspace library first");
    }
    const { data: row, error } = await context.supabase
      .from("project_resources")
      .upsert(
        {
          project_id: data.projectId,
          resource_id: data.resourceId,
          added_by: context.userId,
          notes: data.notes,
        },
        { onConflict: "project_id,resource_id" },
      )
      .select("id, project_id, resource_id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

/** Projects that already contain a resource, used to prevent duplicate assignments. */
export const listResourceProjectAssignments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { resourceId: string }) => ({ resourceId: input?.resourceId ?? "" }))
  .handler(async ({ data, context }) => {
    if (!data.resourceId) throw new Error("resourceId required");
    const { data: rows, error } = await context.supabase
      .from("project_resources")
      .select("project_id")
      .eq("resource_id", data.resourceId);
    if (error) throw new Error(error.message);
    const projectIds = [...new Set((rows ?? []).map((row) => row.project_id))];
    if (!projectIds.length) return [];
    const { data: projects, error: projectError } = await context.supabase
      .from("projects")
      .select("id, name")
      .in("id", projectIds);
    if (projectError) throw new Error(projectError.message);
    const names = new Map((projects ?? []).map((project) => [project.id, project.name]));
    return (rows ?? []).map((row) => ({
      projectId: row.project_id,
      name: names.get(row.project_id) ?? "Project",
    }));
  });

export const removeResourceFromProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { projectId: string; resourceId: string }) => ({
    projectId: input.projectId,
    resourceId: input.resourceId,
  }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("project_resources")
      .delete()
      .eq("project_id", data.projectId)
      .eq("resource_id", data.resourceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** OAuth / app connections scoped to a project. */
export const listProjectConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { projectId: string }) => ({ projectId: input?.projectId ?? "" }))
  .handler(async ({ data, context }) => {
    if (!data.projectId) throw new Error("projectId required");
    const { data: rows, error } = await context.supabase
      .from("project_connections")
      .select(
        "id, project_id, connection_id, created_at, app_connections(id, provider, display_name, status, scopes)",
      )
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const addConnectionToProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { projectId: string; connectionId: string }) => ({
    projectId: input.projectId,
    connectionId: input.connectionId,
  }))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("project_connections")
      .upsert(
        {
          project_id: data.projectId,
          connection_id: data.connectionId,
          added_by: context.userId,
        },
        { onConflict: "project_id,connection_id" },
      )
      .select("id, project_id, connection_id")
      .single();
    if (error) throw new Error(error.message);
    // also stamp project_id on connection for filtering
    await context.supabase
      .from("app_connections")
      .update({ project_id: data.projectId, updated_at: new Date().toISOString() })
      .eq("id", data.connectionId)
      .eq("user_id", context.userId);
    return row;
  });

export const removeConnectionFromProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { projectId: string; connectionId: string }) => ({
    projectId: input.projectId,
    connectionId: input.connectionId,
  }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("project_connections")
      .delete()
      .eq("project_id", data.projectId)
      .eq("connection_id", data.connectionId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Personal workspace library for project assignment. Public Marketplace rows are excluded. */
export const listCatalogForProject = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input?: { resourceType?: string }) => ({
    resourceType: input?.resourceType ?? null,
  }))
  .handler(async ({ data, context }) => {
    const { data: library, error: libraryError } = await context.supabase
      .from("toolkits")
      .select("id")
      .eq("user_id", context.userId)
      .eq("slug", "open-connect-personal-library")
      .maybeSingle();
    if (libraryError) throw new Error(libraryError.message);

    let installedQuery = context.supabase
      .from("toolkit_items")
      .select("resources(id, name, slug, resource_type, description, version, verified)")
      .eq("toolkit_id", library?.id ?? "00000000-0000-0000-0000-000000000000");
    let ownedQuery = context.supabase
      .from("resources")
      .select("id, name, slug, resource_type, description, version, verified")
      .eq("owner_id", context.userId);
    if (data.resourceType) {
      installedQuery = installedQuery.eq("resources.resource_type", data.resourceType);
      ownedQuery = ownedQuery.eq("resource_type", data.resourceType as never);
    }
    const [installed, owned] = await Promise.all([installedQuery, ownedQuery]);
    if (installed.error) throw new Error(installed.error.message);
    if (owned.error) throw new Error(owned.error.message);
    const resources = new Map<string, NonNullable<(typeof owned.data)[number]>>();
    for (const row of installed.data ?? []) {
      if (row.resources) resources.set(row.resources.id, row.resources);
    }
    for (const resource of owned.data ?? []) resources.set(resource.id, resource);
    return Array.from(resources.values()).sort((a, b) => a.name.localeCompare(b.name));
  });

export const listMyConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("app_connections")
      .select("id, provider, display_name, status, project_id, organization_id, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });
