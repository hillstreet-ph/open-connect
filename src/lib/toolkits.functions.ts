import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "toolkit"
  );
}

export const listToolkits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("toolkits")
      .select(
        "id, slug, name, description, published, created_at, toolkit_items(id, position, resources(id, name, resource_type))",
      )
      .neq("slug", "open-connect-personal-library")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createToolkit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      name: string;
      description?: string;
      resourceIds: string[];
      published?: boolean;
    }) => ({
      name: input.name.trim(),
      description: (input.description ?? "").trim(),
      resourceIds: Array.isArray(input.resourceIds) ? input.resourceIds.slice(0, 50) : [],
      published: Boolean(input.published),
    }),
  )
  .handler(async ({ data, context }) => {
    if (!data.name) throw new Error("A toolkit name is required");

    const { data: toolkit, error } = await context.supabase
      .from("toolkits")
      .insert({
        user_id: context.userId,
        name: data.name,
        slug: `${slugify(data.name)}-${Math.random().toString(36).slice(2, 6)}`,
        description: data.description || null,
        published: data.published,
      })
      .select("id, slug")
      .single();
    if (error) throw new Error(error.message);

    if (data.resourceIds.length) {
      const { error: itemsError } = await context.supabase.from("toolkit_items").insert(
        data.resourceIds.map((resourceId, index) => ({
          toolkit_id: toolkit.id,
          resource_id: resourceId,
          position: index,
        })),
      );
      if (itemsError) throw new Error(itemsError.message);
    }

    return toolkit;
  });

export const deleteToolkit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => ({ id: input.id }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("toolkits").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listToolkitProjectAssignments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { toolkitId: string }) => ({ toolkitId: input?.toolkitId ?? "" }))
  .handler(async ({ data, context }) => {
    const { data: items, error: itemError } = await context.supabase
      .from("toolkit_items")
      .select("resource_id")
      .eq("toolkit_id", data.toolkitId);
    if (itemError) throw new Error(itemError.message);
    const resourceIds = (items ?? []).map((item) => item.resource_id);
    if (!resourceIds.length) return [];
    const { data: links, error } = await context.supabase
      .from("project_resources")
      .select("project_id, resource_id")
      .in("resource_id", resourceIds);
    if (error) throw new Error(error.message);
    const projectIds = [...new Set((links ?? []).map((link) => link.project_id))];
    const projects = projectIds.length
      ? await context.supabase.from("projects").select("id, name").in("id", projectIds)
      : { data: [], error: null };
    if (projects.error) throw new Error(projects.error.message);
    const names = new Map((projects.data ?? []).map((project) => [project.id, project.name]));
    const grouped = new Map<string, Set<string>>();
    for (const link of links ?? []) {
      const current = grouped.get(link.project_id) ?? new Set<string>();
      current.add(link.resource_id);
      grouped.set(link.project_id, current);
    }
    return Array.from(grouped.entries())
      .filter(([, ids]) => resourceIds.every((id) => ids.has(id)))
      .map(([projectId]) => ({ projectId, name: names.get(projectId) ?? "Project" }));
  });

export const addToolkitToProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { toolkitId: string; projectId: string }) => ({
    toolkitId: input?.toolkitId ?? "",
    projectId: input?.projectId ?? "",
  }))
  .handler(async ({ data, context }) => {
    if (!data.toolkitId || !data.projectId) throw new Error("Toolkit and project are required");
    const { data: items, error: itemError } = await context.supabase
      .from("toolkit_items")
      .select("resource_id")
      .eq("toolkit_id", data.toolkitId);
    if (itemError) throw new Error(itemError.message);
    if (!items?.length) throw new Error("Add at least one capability to this Toolkit first");
    const { error } = await context.supabase.from("project_resources").upsert(
      items.map((item) => ({
        project_id: data.projectId,
        resource_id: item.resource_id,
        added_by: context.userId,
      })),
      { onConflict: "project_id,resource_id" },
    );
    if (error) throw new Error(error.message);
    return { added: items.length };
  });
