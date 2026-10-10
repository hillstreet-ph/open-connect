import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SecretType =
  "api_key" | "oauth_token" | "mcp_url" | "bot_token" | "password" | "totp" | "other";

export type CredentialFolder = {
  id: string;
  name: string;
  credential_ids: string[];
  project_ids: string[];
  projects: Array<{ id: string; name: string }>;
};

export type CredentialMetadata = {
  id: string;
  name: string;
  secret_type: string;
  email_address: string | null;
  username: string | null;
  website: string | null;
  notes: string | null;
  tags: string[];
  projects: Array<{ id: string; name: string }>;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
  has_secret: boolean;
  has_totp: boolean;
};

export function credentialMetadata(value: unknown): CredentialMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid credential metadata");
  const row = value as Record<string, unknown>;
  const text = (key: string) => (typeof row[key] === "string" ? (row[key] as string) : null);
  const id = text("id"),
    name = text("name");
  if (!id || !name) throw new Error("Credential metadata is missing its identity");
  const projects = Array.isArray(row["projects"]) ? row["projects"] : [];
  return {
    id,
    name,
    secret_type: text("secret_type") ?? "other",
    email_address: text("email_address"),
    username: text("username"),
    website: text("website"),
    notes: text("notes"),
    tags: Array.isArray(row["tags"])
      ? row["tags"].filter((tag): tag is string => typeof tag === "string")
      : [],
    projects: projects.flatMap((project: unknown) => {
      if (!project || typeof project !== "object") return [];
      const p = project as Record<string, unknown>;
      return typeof p["id"] === "string" && typeof p["name"] === "string"
        ? [{ id: p["id"], name: p["name"] }]
        : [];
    }),
    last_used_at: text("last_used_at"),
    created_at: text("created_at") ?? "",
    updated_at: text("updated_at") ?? "",
    has_secret: row["has_secret"] === true,
    has_totp: row["has_totp"] === true,
  };
}

export const listSecrets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("list_credential_secrets");
    if (error) throw new Error(error.message);
    return Array.isArray(data) ? data.map(credentialMetadata) : [];
  });

export const createSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      name: string;
      secret_type?: string;
      secret_value: string;
      email_address?: string;
      username?: string;
      website?: string;
      notes?: string;
      totp_secret?: string;
      tags?: string[];
      project_ids?: string[];
    }) => ({
      name: (input?.name ?? "").trim().slice(0, 120),
      secret_type: (input?.secret_type ?? "api_key") as SecretType,
      secret_value: (input?.secret_value ?? "").trim(),
      email_address: (input?.email_address ?? "").trim().slice(0, 320),
      username: (input?.username ?? "").trim().slice(0, 320),
      website: (input?.website ?? "").trim().slice(0, 2048),
      notes: (input?.notes ?? "").slice(0, 4000),
      totp_secret: (input?.totp_secret ?? "").trim(),
      tags: Array.isArray(input?.tags)
        ? input.tags
            .map((tag) => tag.trim().toLowerCase().slice(0, 40))
            .filter(Boolean)
            .slice(0, 20)
        : [],
      project_ids: Array.isArray(input?.project_ids)
        ? [...new Set(input.project_ids.map((id) => id.trim()).filter(Boolean))]
        : [],
    }),
  )
  .handler(async ({ data, context }) => {
    if (!data.name) throw new Error("Name required");
    if (!data.secret_value || data.secret_value.length < 4) {
      throw new Error("Secret value required (min 4 characters)");
    }
    if (
      ["api_key", "oauth_token", "bot_token"].includes(data.secret_type) &&
      /\s/.test(data.secret_value)
    ) {
      throw new Error("API keys and tokens cannot contain spaces or sentences");
    }

    const { error: duplicateError } = await context.supabase.rpc("assert_credential_value_unique", {
      p_secret_value: data.secret_value,
    });
    if (duplicateError) throw new Error(duplicateError.message);

    const { data: row, error } = await context.supabase.rpc("create_credential_item", {
      p_name: data.name,
      p_secret_type: data.secret_type,
      // Vault items do not grant capabilities. Project sharing and API-key
      // policies are managed by their dedicated access-control surfaces.
      p_scopes: [],
      p_secret_value: data.secret_value,
      p_email_address: data.email_address,
      p_username: data.username,
      p_website: data.website,
      p_notes: data.notes,
      p_totp_secret: data.totp_secret,
    });

    if (error) throw new Error(error.message);
    const credentialId = (row as { id?: string } | null)?.id;
    if (!credentialId) throw new Error("Credential was stored without an identifier");

    const { error: organizeError } = await context.supabase.rpc("organize_credential", {
      p_credential_id: credentialId,
      p_tags: data.tags,
      p_project_ids: data.project_ids,
    });
    if (organizeError) {
      await context.supabase.rpc("delete_credential_secret", { p_id: credentialId });
      throw new Error(organizeError.message);
    }
    return row;
  });

export const updateSecretOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string; notes?: string; tags?: string[]; project_ids?: string[] }) => ({
    id: (input?.id ?? "").trim(),
    notes: (input?.notes ?? "").slice(0, 4000),
    tags: Array.isArray(input?.tags)
      ? input.tags
          .map((tag) => tag.trim().toLowerCase().slice(0, 40))
          .filter(Boolean)
          .slice(0, 20)
      : [],
    project_ids: Array.isArray(input?.project_ids)
      ? [...new Set(input.project_ids.map((id) => id.trim()).filter(Boolean))]
      : [],
  }))
  .handler(async ({ data, context }) => {
    if (!data.id) throw new Error("id required");
    const { data: result, error } = await context.supabase.rpc("update_credential_organization", {
      p_credential_id: data.id,
      p_notes: data.notes,
      p_tags: data.tags,
      p_project_ids: data.project_ids,
    });
    if (error) throw new Error(error.message);
    return result;
  });

export const updateSecretValue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string; value: string }) => ({
    id: (input?.id ?? "").trim(),
    value: input?.value ?? "",
  }))
  .handler(async ({ data, context }) => {
    if (!data.id) throw new Error("id required");
    if (data.value.length < 4) throw new Error("Secret value required (min 4 characters)");
    const { data: result, error } = await context.supabase.rpc("update_credential_secret_value", {
      p_id: data.id,
      p_secret_value: data.value,
    });
    if (error) throw new Error(error.message);
    return result;
  });

export const listCredentialFolders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("list_credential_folders");
    if (error) throw new Error(error.message);
    return (Array.isArray(data) ? data : []) as unknown as CredentialFolder[];
  });

export const createCredentialFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { name: string }) => ({
    name: (input?.name ?? "").trim().slice(0, 80),
  }))
  .handler(async ({ data, context }) => {
    if (!data.name) throw new Error("Folder name required");
    const { data: result, error } = await context.supabase.rpc("create_credential_folder", {
      p_name: data.name,
    });
    if (error) throw new Error(error.message);
    return result;
  });

export const updateCredentialFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { id: string; name: string; credential_ids?: string[]; project_ids?: string[] }) => ({
      id: (input?.id ?? "").trim(),
      name: (input?.name ?? "").trim().slice(0, 80),
      credential_ids: Array.isArray(input?.credential_ids)
        ? [...new Set(input.credential_ids.map((id) => id.trim()).filter(Boolean))]
        : [],
      project_ids: Array.isArray(input?.project_ids)
        ? [...new Set(input.project_ids.map((id) => id.trim()).filter(Boolean))]
        : [],
    }),
  )
  .handler(async ({ data, context }) => {
    if (!data.id) throw new Error("Folder id required");
    if (!data.name) throw new Error("Folder name required");
    const { data: result, error } = await context.supabase.rpc("update_credential_folder", {
      p_folder_id: data.id,
      p_name: data.name,
      p_credential_ids: data.credential_ids,
      p_project_ids: data.project_ids,
    });
    if (error) throw new Error(error.message);
    return result;
  });

export const deleteCredentialFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => ({ id: (input?.id ?? "").trim() }))
  .handler(async ({ data, context }) => {
    if (!data.id) throw new Error("Folder id required");
    const { data: deleted, error } = await context.supabase.rpc("delete_credential_folder", {
      p_folder_id: data.id,
    });
    if (error) throw new Error(error.message);
    return { ok: deleted };
  });

export const revealSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => ({ id: (input?.id ?? "").trim() }))
  .handler(async ({ data, context }) => {
    if (!data.id) throw new Error("id required");
    const { data: result, error } = await context.supabase.rpc("reveal_credential_secret", {
      p_id: data.id,
    });
    if (error) throw new Error(error.message);
    return result as { value: string };
  });

export const deleteSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => ({ id: (input?.id ?? "").trim() }))
  .handler(async ({ data, context }) => {
    if (!data.id) throw new Error("id required");
    const { data: deleted, error } = await context.supabase.rpc("delete_credential_secret", {
      p_id: data.id,
    });
    if (error) throw new Error(error.message);
    return { ok: deleted };
  });

export const getTotpCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => ({ id: (input?.id ?? "").trim() }))
  .handler(async ({ data, context }) => {
    if (!data.id) throw new Error("id required");
    const { data: result, error } = await context.supabase.rpc("get_credential_totp_code", {
      p_id: data.id,
    });
    if (error) throw new Error(error.message);
    return result as { code: string; seconds_remaining: number };
  });
