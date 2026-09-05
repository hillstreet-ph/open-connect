import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BUCKET = "resource-packages";

function skillManifest(resource: {
  name: string;
  slug: string;
  description: string | null;
  resource_type: string;
  version: string | null;
  author?: string | null;
  installation_config?: unknown;
}) {
  const config =
    resource.installation_config && typeof resource.installation_config === "object"
      ? JSON.stringify(resource.installation_config, null, 2)
      : "";
  return `# ${resource.name}

**Slug:** \`${resource.slug}\`  
**Type:** ${resource.resource_type}  
**Version:** ${resource.version ?? "1.0.0"}  
**Author:** ${resource.author ?? "open-connect"}

## Description

${resource.description ?? "Open-Connect marketplace package."}

## Platform

- Domain: https://open-connect.site
- MCP: https://open-connect.site/mcp
- Models: https://open-connect.site/v1
- Stack: GitHub + Cloudflare + Supabase only (no Vercel)

## Install

1. Sign in at https://open-connect.site/auth
2. Download from Marketplace (login required)
3. Or use MCP tools/list with an \`oc_live_\` API key

${config ? `## Installation config\n\n\`\`\`json\n${config}\n\`\`\`\n` : ""}
`;
}

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

/** Storage package URL when present; otherwise skill/catalog markdown for logged-in clients. */
export const getResourceDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: input?.id ?? "" }))
  .handler(async ({ data, context }) => {
    if (!data.id) throw new Error("id required");

    const { data: resource, error } = await context.supabase
      .from("resources")
      .select(
        "id, name, slug, description, resource_type, version, author, package_path, package_filename, owner_id, published, installation_config",
      )
      .eq("id", data.id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!resource) throw new Error("Not found");
    if (!resource.published && resource.owner_id !== context.userId) {
      throw new Error("Not allowed");
    }

    if (resource.package_path) {
      const { data: signed, error: signError } = await context.supabase.storage
        .from(BUCKET)
        .createSignedUrl(resource.package_path, 3600);

      if (signError || !signed?.signedUrl) {
        throw new Error(signError?.message ?? "Could not sign download URL");
      }

      return {
        kind: "url" as const,
        url: signed.signedUrl,
        filename: resource.package_filename ?? `${resource.slug}.zip`,
        expires_in: 3600,
      };
    }

    const markdown = skillManifest(resource);
    const filename = `${resource.slug || resource.name}.md`;
    return {
      kind: "markdown" as const,
      content: markdown,
      filename,
      mime: "text/markdown;charset=utf-8",
    };
  });

/** View package metadata / manifest (login required). */
export const getResourceView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: input?.id ?? "" }))
  .handler(async ({ data, context }) => {
    if (!data.id) throw new Error("id required");
    const { data: resource, error } = await context.supabase
      .from("resources")
      .select(
        "id, slug, name, description, resource_type, version, author, license, verified, featured, supported_clients, package_path, package_filename, package_size, installation_config, published, owner_id",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!resource) throw new Error("Not found");
    if (!resource.published && resource.owner_id !== context.userId) {
      throw new Error("Not allowed");
    }
    return {
      ...resource,
      manifest: skillManifest(resource),
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
