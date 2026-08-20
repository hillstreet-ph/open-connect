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
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createToolkit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name: string; description?: string; resourceIds: string[]; published?: boolean }) => ({
    name: input.name.trim(),
    description: (input.description ?? "").trim(),
    resourceIds: Array.isArray(input.resourceIds) ? input.resourceIds.slice(0, 50) : [],
    published: Boolean(input.published),
  }))
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
  .inputValidator((input: { id: string }) => ({ id: input.id }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("toolkits").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
