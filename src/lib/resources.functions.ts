import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BUCKET = "resource-packages";

export const listMyResources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("resources")
      .select(
        "id, slug, name, description, resource_type, version, published, package_path, package_filename, package_size, package_mime, created_at, updated_at",
      )
      .eq("owner_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const registerResourcePackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      name: string;
      slug: string;
      description?: string;
      resource_type: string;
      package_path: string;
      package_filename: string;
      package_size?: number;
      package_mime?: string;
      published?: boolean;
      version?: string;
    }) => ({
      name: (input?.name ?? "").trim() || "Untitled",
      slug: (input?.slug ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80),
      description: (input?.description ?? "").trim() || null,
      resource_type: input?.resource_type ?? "skill",
      package_path: input?.package_path ?? "",
      package_filename: input?.package_filename ?? "",
      package_size: input?.package_size ?? null,
      package_mime: input?.package_mime ?? null,
      published: input?.published !== false,
      version: (input?.version ?? "1.0.0").trim() || "1.0.0",
    }),
  )
  .handler(async ({ data, context }) => {
    if (!data.slug) throw new Error("Invalid slug");
    if (!data.package_path) throw new Error("package_path required");

    const uniqueSlug = `${data.slug}-${context.userId.slice(0, 6)}`;

    const row = {
      name: data.name,
      slug: uniqueSlug,
      description: data.description,
      resource_type: data.resource_type as
        | "skill"
        | "mcp"
        | "tool"
        | "plugin"
        | "agent"
        | "prompt"
        | "guide"
        | "app"
        | "model",
      owner_id: context.userId,
      package_path: data.package_path,
      package_filename: data.package_filename,
      package_size: data.package_size,
      package_mime: data.package_mime,
      published: data.published,
      version: data.version,
      installation_type: "package",
      installation_config: {
        storage_bucket: BUCKET,
        path: data.package_path,
        filename: data.package_filename,
      },
      source: "user-upload",
      author: context.userId.slice(0, 8),
      license: "proprietary",
      verified: false,
      featured: false,
      supported_clients: ["chatgpt", "claude", "hermes", "custom"],
    };

    const { data: inserted, error } = await context.supabase
      .from("resources")
      .insert(row)
      .select(
        "id, slug, name, description, resource_type, version, published, package_path, package_filename, package_size",
      )
      .single();

    if (error) throw new Error(error.message);
    return inserted;
  });

export const getResourceDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: input?.id ?? "" }))
  .handler(async ({ data, context }) => {
    if (!data.id) throw new Error("id required");

    const { data: resource, error } = await context.supabase
      .from("resources")
      .select("id, name, package_path, package_filename, owner_id, published")
      .eq("id", data.id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!resource?.package_path) throw new Error("No package attached");
    if (!resource.published && resource.owner_id !== context.userId) {
      throw new Error("Not allowed");
    }

    const { data: signed, error: signError } = await context.supabase.storage
      .from(BUCKET)
      .createSignedUrl(resource.package_path, 3600, {
        download: resource.package_filename || undefined,
      });

    if (signError || !signed?.signedUrl) {
      throw new Error(signError?.message ?? "Could not sign download URL");
    }

    return {
      url: signed.signedUrl,
      filename: resource.package_filename ?? resource.name,
      expires_in: 3600,
    };
  });

export const deleteMyResource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: input?.id ?? "" }))
  .handler(async ({ data, context }) => {
    const { data: resource, error } = await context.supabase
      .from("resources")
      .select("id, package_path, owner_id")
      .eq("id", data.id)
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!resource) throw new Error("Not found");

    if (resource.package_path) {
      await context.supabase.storage.from(BUCKET).remove([resource.package_path]);
    }
    const { error: delError } = await context.supabase.from("resources").delete().eq("id", resource.id);
    if (delError) throw new Error(delError.message);
    return { ok: true };
  });
