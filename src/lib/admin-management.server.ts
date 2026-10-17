import type { SupabaseClient } from "@supabase/supabase-js";

export class ResourceManagementError extends Error {}

export const ADMIN_RESOURCE_TYPES = [
  "skill",
  "mcp",
  "tool",
  "plugin",
  "agent",
  "prompt",
  "guide",
  "app",
  "model",
  "toolkit",
  "memory",
  "knowledge",
];
const FIELDS =
  "id,slug,name,description,resource_type,version,license,published,verified,package_filename,package_size,updated_at";
const BUCKET = "resource-packages";
type Context = {
  userId: string;
  scopes: string[];
  organizationId?: string | null;
  workspaceId?: string | null;
  projectId?: string | null;
};

export function adminAccess(key: Context, admin: boolean) {
  const personal = !key.organizationId && !key.workspaceId && !key.projectId;
  const control = key.scopes.includes("control:write");
  return {
    administrator: admin,
    personal_context: personal,
    scopes: key.scopes,
    capabilities: {
      resource_management: admin && personal && control && key.scopes.includes("resources:write"),
      credential_metadata: personal && key.scopes.includes("secrets:read"),
      credential_value_read_via_mcp: false,
      credential_value_write_via_mcp: false,
      credential_management_url: "https://open-connect.site/secrets",
      publication_requires_verified_resource: true,
      secure_injection_available: false,
    },
  };
}

export function requireResourceManagement(key: Context, admin: boolean) {
  if (!admin || !key.scopes.includes("control:write") || !key.scopes.includes("resources:write"))
    throw new ResourceManagementError(
      "Admin role, control:write and resources:write are required.",
    );
  if (key.projectId || key.workspaceId || key.organizationId)
    throw new ResourceManagementError(
      "Resource management requires a personal key; scoped keys cannot mutate the personal library.",
    );
}

function text(input: unknown, label: string, max: number, optional = false) {
  if (optional && input === undefined) return undefined;
  if (typeof input !== "string" || (!optional && !input.trim()) || input.length > max)
    throw new ResourceManagementError(`Invalid ${label}.`);
  return input.trim();
}

function noSecrets(value: string) {
  if (
    /-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:oc_live_|ghp_|github_pat_|sk-proj-|sk-or-v1-)[A-Za-z0-9_-]{12,}|\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(
      value,
    )
  )
    throw new ResourceManagementError(
      "Credential material is not accepted in resource content. Use the authenticated Secrets screen.",
    );
}

function identity(args: Record<string, unknown>) {
  const id = text(args["id"], "resource id", 36)!;
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id))
    throw new ResourceManagementError("Invalid resource id.");
  const expected = text(args["expected_updated_at"], "expected_updated_at", 50)!;
  if (!Number.isFinite(Date.parse(expected)))
    throw new ResourceManagementError("Invalid expected_updated_at.");
  return { id, expected };
}

export function resourceMetadata(args: Record<string, unknown>, creating: boolean) {
  const allowed = new Set(
    creating
      ? ["name", "slug", "description", "resource_type", "version", "license"]
      : ["id", "expected_updated_at", "name", "description", "version", "license"],
  );
  if (Object.keys(args).some((key) => !allowed.has(key)))
    throw new ResourceManagementError("Unsupported resource field.");
  const row: Record<string, string> = {};
  for (const [field, max] of [
    ["name", 120],
    ["description", 4000],
    ["version", 40],
    ["license", 80],
  ] as const) {
    const value = text(args[field], field, max, !(creating && field === "name"));
    if (value !== undefined) row[field] = value;
  }
  if (creating) {
    const slug = text(args["slug"], "slug", 80)!;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
      throw new ResourceManagementError("Use a lowercase slug with hyphens.");
    const type = text(args["resource_type"], "resource_type", 30)!;
    if (!ADMIN_RESOURCE_TYPES.includes(type))
      throw new ResourceManagementError("Unsupported resource type.");
    row["slug"] = slug;
    row["resource_type"] = type;
    row["version"] ??= "1.0.0";
    row["license"] ??= "proprietary";
  } else if (!Object.keys(row).length)
    throw new ResourceManagementError("Supply a resource field to update.");
  noSecrets(JSON.stringify(row));
  return row;
}

export function resourceContent(args: Record<string, unknown>) {
  const filename = text(args["filename"], "filename", 120)!;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.(md|json|txt)$/.test(filename))
    throw new ResourceManagementError(
      "Upload a plain Markdown, JSON or text file; use Studio for ZIP packages.",
    );
  if (
    typeof args["content"] !== "string" ||
    !args["content"].trim() ||
    args["content"].includes("\0")
  )
    throw new ResourceManagementError("Non-empty text content required.");
  const bytes = new TextEncoder().encode(args["content"]);
  if (bytes.length > 262144) throw new ResourceManagementError("Content exceeds 256 KiB.");
  noSecrets(args["content"]);
  if (filename.endsWith(".json")) {
    try {
      JSON.parse(args["content"]);
    } catch {
      throw new ResourceManagementError("Upload valid JSON content.");
    }
  }
  return {
    filename,
    bytes,
    mime: filename.endsWith(".json") ? "application/json" : "text/plain; charset=utf-8",
  };
}

export async function manageResource(
  db: SupabaseClient,
  key: Context,
  admin: boolean,
  operation: string,
  args: Record<string, unknown>,
) {
  requireResourceManagement(key, admin);
  if (operation === "create_resource") {
    const metadata = resourceMetadata(args, true);
    const { data, error } = await db
      .from("resources")
      .insert({
        ...metadata,
        owner_id: key.userId,
        published: false,
        verified: false,
        featured: false,
        source: "user-upload",
      })
      .select(FIELDS)
      .single();
    if (error)
      throw new ResourceManagementError(
        "Resource could not be created; check whether the slug already exists.",
      );
    return { resource: data, created: true, executable: false };
  }
  const { id, expected } = identity(args);
  const { data: resource, error: readError } = await db
    .from("resources")
    .select("id,updated_at,verified,published")
    .eq("id", id)
    .eq("owner_id", key.userId)
    .maybeSingle();
  if (readError || !resource) throw new ResourceManagementError("Owned resource not found.");
  if (resource.updated_at !== expected)
    throw new ResourceManagementError("Resource changed. Read it again before updating.");
  let update: Record<string, unknown>;
  let uploadedPath: string | null = null;
  if (operation === "update_resource") {
    update = { ...resourceMetadata(args, false), verified: false, published: false };
  } else if (operation === "upload_resource_content") {
    if (
      Object.keys(args).some(
        (key) => !["id", "expected_updated_at", "filename", "content"].includes(key),
      )
    )
      throw new ResourceManagementError("Unsupported upload field.");
    const content = resourceContent(args);
    uploadedPath = `${key.userId}/${id}/${crypto.randomUUID()}/${content.filename}`;
    const { error } = await db.storage
      .from(BUCKET)
      .upload(uploadedPath, content.bytes, { contentType: content.mime, upsert: false });
    if (error) throw new ResourceManagementError("Resource content could not be uploaded.");
    update = {
      package_path: uploadedPath,
      package_filename: content.filename,
      package_size: content.bytes.length,
      package_mime: content.mime,
      installation_type: "package",
      installation_config: {
        storage_bucket: BUCKET,
        path: uploadedPath,
        filename: content.filename,
      },
      verified: false,
      published: false,
    };
  } else if (operation === "set_resource_publication") {
    if (
      Object.keys(args).some(
        (key) => !["id", "expected_updated_at", "published", "confirm"].includes(key),
      )
    )
      throw new ResourceManagementError("Unsupported publication field.");
    if (typeof args["published"] !== "boolean" || args["confirm"] !== true)
      throw new ResourceManagementError("Publication changes require published and confirm=true.");
    if (args["published"] && !resource.verified)
      throw new ResourceManagementError(
        "Complete the separate resource security review before publishing.",
      );
    update = { published: args["published"] };
  } else throw new ResourceManagementError("Unsupported resource operation.");
  // Compare-and-set prevents overwriting concurrent uploads, edits or review decisions.
  const { data, error } = await db
    .from("resources")
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_id", key.userId)
    .eq("updated_at", expected)
    .select(FIELDS)
    .maybeSingle();
  if (error || !data) {
    if (uploadedPath) await db.storage.from(BUCKET).remove([uploadedPath]);
    throw new ResourceManagementError(
      "Resource update failed or conflicted. Read the resource before retrying.",
    );
  }
  return { resource: data, updated: true };
}
