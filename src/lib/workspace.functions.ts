import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Catalog items linked to a project workspace. */
export const listProjectResources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { projectId: string }) => ({
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
  .inputValidator((input: { projectId: string; resourceId: string; notes?: string }) => ({
    projectId: input.projectId,
    resourceId: input.resourceId,
    notes: (input?.notes ?? "").trim() || null,
  }))
  .handler(async ({ data, context }) => {
    if (!data.projectId || !data.resourceId) throw new Error("project and resource required");
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

export const removeResourceFromProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { projectId: string; resourceId: string }) => ({
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
  .inputValidator((input: { projectId: string }) => ({ projectId: input?.projectId ?? "" }))
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
  .inputValidator((input: { projectId: string; connectionId: string }) => ({
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
  .inputValidator((input: { projectId: string; connectionId: string }) => ({
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

/** Published catalog for "add to project" pickers. */
export const listCatalogForProject = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { resourceType?: string }) => ({
    resourceType: input?.resourceType ?? null,
  }))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("resources")
      .select("id, name, slug, resource_type, description, version, verified")
      .eq("published", true)
      .order("name")
      .limit(200);
    if (data.resourceType) q = q.eq("resource_type", data.resourceType);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
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
