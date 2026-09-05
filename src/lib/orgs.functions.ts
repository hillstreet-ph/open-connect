import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function slugify(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export const listOrganizations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("organizations")
      .select("id, name, slug, owner_id, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name: string }) => ({
    name: (input?.name ?? "").trim(),
  }))
  .handler(async ({ data, context }) => {
    if (!data.name) throw new Error("Organization name required");
    const slug = `${slugify(data.name) || "org"}-${context.userId.slice(0, 6)}`;
    const { data: org, error } = await context.supabase
      .from("organizations")
      .insert({ name: data.name, slug, owner_id: context.userId })
      .select("id, name, slug")
      .single();
    if (error) throw new Error(error.message);

    await context.supabase.from("organization_members").insert({
      organization_id: org.id,
      user_id: context.userId,
      role: "owner",
    });

    return org;
  });

export const listProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { organizationId?: string }) => ({
    organizationId: input?.organizationId ?? null,
  }))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("projects")
      .select("id, organization_id, name, slug, description, created_at, organizations(name, slug)")
      .order("created_at", { ascending: false });
    if (data.organizationId) q = q.eq("organization_id", data.organizationId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { organizationId: string; name: string; description?: string }) => ({
    organizationId: input.organizationId,
    name: (input?.name ?? "").trim(),
    description: (input?.description ?? "").trim() || null,
  }))
  .handler(async ({ data, context }) => {
    if (!data.name) throw new Error("Project name required");
    if (!data.organizationId) throw new Error("Pick an organization");
    const slug = slugify(data.name) || "project";
    const { data: project, error } = await context.supabase
      .from("projects")
      .insert({
        organization_id: data.organizationId,
        name: data.name,
        slug: `${slug}-${Date.now().toString(36).slice(-4)}`,
        description: data.description,
        created_by: context.userId,
      })
      .select("id, name, slug, organization_id")
      .single();
    if (error) throw new Error(error.message);
    return project;
  });
