import { credentialMetadata } from "@/lib/secrets.functions";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProjectResourceRow } from "@/lib/resource-categories";
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
    // Project tables are migration-backed and absent from the legacy generated schema.
    const projectDb = context.supabase as SupabaseClient;
    const { data: project, error: projectError } = await projectDb
      .from("projects")
      .select("id")
      .eq("id", data.projectId)
      .maybeSingle();
    if (projectError || !project) throw new Error("Project unavailable or access denied");
    const { data: rows, error } = await context.supabase
      .from("project_resources")
      .select(
        "id, project_id, resource_id, notes, created_at, resources(id, name, slug, resource_type, description, version, verified)",
      )
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const { readWorkspaceLibrary } = await import("@/lib/workspace-library.server");
    const { mergeSharedProjectResources } = await import("@/lib/shared-resources");
    const library = await readWorkspaceLibrary(context);
    return mergeSharedProjectResources((rows ?? []) as unknown as ProjectResourceRow[], library);
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

/** Connections explicitly shared with this project. Secret references are never returned. */
export const listProjectConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { projectId: string }) => ({ projectId: input?.projectId ?? "" }))
  .handler(async ({ data, context }) => {
    if (!data.projectId) throw new Error("projectId required");
    const db = context.supabase as SupabaseClient;
    const { data: rows, error } = await db.rpc("list_project_connections", {
      p_project_id: data.projectId,
    });
    if (error) throw new Error(error.message);
    return Array.isArray(rows) ? rows : [];
  });

/** Own connected cloud providers plus connections explicitly shared with the selected project. */
export const listProjectCloudConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { projectId: string }) => ({ projectId: input?.projectId ?? "" }))
  .handler(async ({ data, context }) => {
    if (!data.projectId) throw new Error("projectId required");
    const db = context.supabase as SupabaseClient;
    const [sharedResult, ownResult] = await Promise.all([
      db.rpc("list_project_connections", { p_project_id: data.projectId }),
      context.supabase
        .from("app_connections")
        .select("id, provider, display_name, status, scopes")
        .eq("user_id", context.userId)
        .eq("provider", "custom_mcp")
        .eq("status", "connected"),
    ]);
    if (sharedResult.error) throw new Error(sharedResult.error.message);
    if (ownResult.error) throw new Error(ownResult.error.message);
    const available = new Map<
      string,
      {
        id: string;
        provider: string;
        display_name: string;
        status: string;
        scopes: string[];
        access: string;
      }
    >();
    for (const connection of ownResult.data ?? []) {
      available.set(connection.id, { ...connection, access: "Personal" });
    }
    const sharedRows = Array.isArray(sharedResult.data)
      ? (sharedResult.data as Array<{
          app_connections?: {
            id?: string;
            provider?: string;
            display_name?: string;
            status?: string;
            scopes?: string[];
          } | null;
        }>)
      : [];
    for (const row of sharedRows) {
      const connection = row.app_connections;
      if (!connection?.id || connection.provider !== "custom_mcp") continue;
      const existing = available.get(connection.id);
      available.set(connection.id, {
        id: connection.id,
        provider: connection.provider,
        display_name: connection.display_name ?? connection.provider,
        status: connection.status ?? "unknown",
        scopes: connection.scopes ?? [],
        access: existing ? "Personal · shared with project" : "Shared with project",
      });
    }
    return Array.from(available.values()).sort((a, b) =>
      a.display_name.localeCompare(b.display_name),
    );
  });

export const addConnectionToProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { projectId: string; connectionId: string }) => ({
    projectId: input.projectId,
    connectionId: input.connectionId,
  }))
  .handler(async ({ data, context }) => {
    const db = context.supabase as SupabaseClient;
    const { data: row, error } = await db.rpc("add_project_connection", {
      p_project_id: data.projectId,
      p_connection_id: data.connectionId,
    });
    if (error) throw new Error(error.message);
    return row;
  });

export const removeConnectionFromProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { projectId: string; connectionId: string }) => ({
    projectId: input.projectId,
    connectionId: input.connectionId,
  }))
  .handler(async ({ data, context }) => {
    const db = context.supabase as SupabaseClient;
    const { data: removed, error } = await db.rpc("remove_project_connection", {
      p_project_id: data.projectId,
      p_connection_id: data.connectionId,
    });
    if (error) throw new Error(error.message);
    return { ok: removed };
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
      installedQuery = installedQuery.eq(
        "resources.resource_type",
        data.resourceType as import("@/integrations/supabase/types").Database["public"]["Enums"]["resource_type"],
      );
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
      .select("id, provider, display_name, status, scopes, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** Metadata-only credentials from the general Vault, available for project scoping. */
export const listMyCredentialMetadata = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("list_credential_secrets");
    if (error) throw new Error(error.message);
    return Array.isArray(data) ? data.map(credentialMetadata) : [];
  });

export const listProjectCredentials = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { projectId: string }) => ({ projectId: input?.projectId ?? "" }))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("list_project_credentials", {
      p_project_id: data.projectId,
    });
    if (error) throw new Error(error.message);
    return Array.isArray(rows)
      ? rows.map((value) => {
          if (!value || typeof value !== "object" || Array.isArray(value))
            throw new Error("Invalid project credential metadata");
          const row = value as Record<string, unknown>;
          if (typeof row["id"] !== "string" || typeof row["credential_id"] !== "string")
            throw new Error("Project credential identity is missing");
          const strings = (key: string) =>
            Array.isArray(row[key])
              ? row[key].filter((item): item is string => typeof item === "string")
              : [];
          return {
            id: row["id"],
            credential_id: row["credential_id"],
            name: typeof row["name"] === "string" ? row["name"] : "Credential",
            secret_type: typeof row["secret_type"] === "string" ? row["secret_type"] : "other",
            scopes: strings("scopes"),
            folder_names: strings("folder_names"),
            shared_via_folder: row["shared_via_folder"] === true,
            can_remove: row["can_remove"] === true,
          };
        })
      : [];
  });

export const addCredentialToProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { projectId: string; credentialId: string }) => ({
    projectId: input.projectId,
    credentialId: input.credentialId,
  }))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("add_project_credential", {
      p_project_id: data.projectId,
      p_credential_id: data.credentialId,
    });
    if (error) throw new Error(error.message);
    return row;
  });

export const removeCredentialFromProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { projectId: string; credentialId: string }) => ({
    projectId: input.projectId,
    credentialId: input.credentialId,
  }))
  .handler(async ({ data, context }) => {
    const { data: removed, error } = await context.supabase.rpc("remove_project_credential", {
      p_project_id: data.projectId,
      p_credential_id: data.credentialId,
    });
    if (error) throw new Error(error.message);
    return { ok: removed };
  });
