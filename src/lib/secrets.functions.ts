import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeCredentialValue, sameCredentialIdentity } from "./credential-save-policy";
import {
  NOTES_MAX_LENGTH,
  findCredentialNotes,
  resolveNotesForUpdate,
  withoutNotes,
} from "./credential-notes";

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

/** Credential metadata as sent to list views: note text is never included. */
export type CredentialListItem = Omit<CredentialMetadata, "notes"> & { has_notes: boolean };

export const listSecrets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CredentialListItem[]> => {
    const { data, error } = await context.supabase.rpc("list_credential_secrets");
    if (error) throw new Error(error.message);
    return Array.isArray(data) ? data.map((row) => withoutNotes(credentialMetadata(row))) : [];
  });

/** Returns the notes of exactly one owned credential, on explicit user request. */
export const revealCredentialNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => ({ id: (input?.id ?? "").trim() }))
  .handler(async ({ data, context }) => {
    if (!data.id) throw new Error("id required");
    const { data: rows, error } = await context.supabase.rpc("list_credential_secrets");
    if (error) throw new Error(error.message);
    const owned = Array.isArray(rows) ? rows.map(credentialMetadata) : [];
    return { notes: findCredentialNotes(owned, data.id) };
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
      secret_value: normalizeCredentialValue(
        input?.secret_value ?? "",
        input?.secret_type ?? "api_key",
      ),
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

    const { data: owned, error: inventoryError } =
      await context.supabase.rpc("list_credential_secrets");
    if (inventoryError)
      throw new Error("Existing credentials could not be checked. No credential was created.");
    if (!Array.isArray(owned))
      throw new Error("Credential inventory is unavailable. No credential was created.");
    const existing = owned.map(credentialMetadata);
    if (existing.some((item) => sameCredentialIdentity(data, item))) {
      throw new Error(
        "A credential with this name, type, account and website already exists. Reuse or explicitly edit that entry. Use a distinct name only for a separate credential purpose; no values were changed.",
      );
    }
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

// Each item costs two Supabase subrequests (create + organize). Cloudflare Workers allow
// 50 subrequests per request on the free plan, so keep batches well under that.
const IMPORT_BATCH_LIMIT = 15;
const IMPORT_TYPES = new Set(["password", "totp", "other"]);

export type CredentialImportResult = {
  row: number;
  status: "created" | "skipped" | "failed";
  reason?: string;
};

/** Saves one batch of password-manager items; results never echo secret values. */
export const importCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      items: Array<{
        row: number;
        name: string;
        secret_type: string;
        secret_value: string;
        email_address?: string;
        username?: string;
        website?: string;
        notes?: string;
        totp_secret?: string;
        tags?: string[];
      }>;
    }) => {
      const items = Array.isArray(input?.items) ? input.items : [];
      if (items.length > IMPORT_BATCH_LIMIT)
        throw new Error(`Import at most ${IMPORT_BATCH_LIMIT} credentials per batch`);
      return items.map((item) => ({
        row: Number(item?.row) || 0,
        name: String(item?.name ?? "")
          .trim()
          .slice(0, 120),
        secret_type: String(item?.secret_type ?? ""),
        secret_value: normalizeCredentialValue(
          String(item?.secret_value ?? ""),
          String(item?.secret_type ?? ""),
        ),
        email_address: String(item?.email_address ?? "")
          .trim()
          .slice(0, 320),
        username: String(item?.username ?? "")
          .trim()
          .slice(0, 320),
        website: String(item?.website ?? "")
          .trim()
          .slice(0, 2048),
        notes: String(item?.notes ?? "").slice(0, 4000),
        totp_secret: String(item?.totp_secret ?? "").trim(),
        tags: Array.isArray(item?.tags)
          ? item.tags
              .map((tag) => String(tag).trim().toLowerCase().slice(0, 40))
              .filter(Boolean)
              .slice(0, 20)
          : [],
      }));
    },
  )
  .handler(async ({ data, context }): Promise<CredentialImportResult[]> => {
    const { data: owned, error: inventoryError } =
      await context.supabase.rpc("list_credential_secrets");
    if (inventoryError || !Array.isArray(owned))
      throw new Error("Existing credentials could not be checked. Nothing was imported.");
    const existing = owned.map(credentialMetadata);
    const results: CredentialImportResult[] = [];
    for (const item of data) {
      if (!item.name || !IMPORT_TYPES.has(item.secret_type) || item.secret_value.length < 4) {
        results.push({ row: item.row, status: "failed", reason: "Missing name or secret" });
        continue;
      }
      if (existing.some((other) => sameCredentialIdentity(item, other))) {
        results.push({ row: item.row, status: "skipped", reason: "Already in your vault" });
        continue;
      }
      const { data: row, error } = await context.supabase.rpc("create_credential_item", {
        p_name: item.name,
        p_secret_type: item.secret_type,
        p_scopes: [],
        p_secret_value: item.secret_value,
        p_email_address: item.email_address,
        p_username: item.username,
        p_website: item.website,
        p_notes: item.notes,
        p_totp_secret: item.totp_secret,
      });
      const id = (row as { id?: string } | null)?.id;
      if (error || !id) {
        // Database messages can quote inputs; report a fixed reason instead.
        results.push({ row: item.row, status: "failed", reason: "Vault rejected this item" });
        continue;
      }
      if (item.tags.length) {
        const { error: organizeError } = await context.supabase.rpc("organize_credential", {
          p_credential_id: id,
          p_tags: item.tags,
          p_project_ids: [],
        });
        if (organizeError) {
          await context.supabase.rpc("delete_credential_secret", { p_id: id });
          results.push({ row: item.row, status: "failed", reason: "Tags could not be saved" });
          continue;
        }
      }
      existing.push({
        ...credentialMetadata({ id, name: item.name }),
        secret_type: item.secret_type,
        email_address: item.email_address,
        username: item.username,
        website: item.website,
      });
      results.push({ row: item.row, status: "created" });
    }
    return results;
  });

export const updateSecretOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      id: string;
      notes?: string | undefined;
      tags?: string[];
      project_ids?: string[];
    }) => ({
      id: (input?.id ?? "").trim(),
      // undefined = notes were not loaded/edited in the UI; the stored value is preserved.
      notes: typeof input?.notes === "string" ? input.notes.slice(0, NOTES_MAX_LENGTH) : undefined,
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
    if (!data.id) throw new Error("id required");
    let currentNotes: string | null = null;
    if (data.notes === undefined) {
      const { data: rows, error: inventoryError } =
        await context.supabase.rpc("list_credential_secrets");
      if (inventoryError || !Array.isArray(rows))
        throw new Error("Existing notes could not be checked. Nothing was changed.");
      currentNotes = findCredentialNotes(rows.map(credentialMetadata), data.id);
    }
    const { data: result, error } = await context.supabase.rpc("update_credential_organization", {
      p_credential_id: data.id,
      p_notes: resolveNotesForUpdate(data.notes, currentNotes),
      p_tags: data.tags,
      p_project_ids: data.project_ids,
    });
    if (error) throw new Error(error.message);
    // The RPC echoes notes; never send them back in a mutation response.
    const organization = (result ?? {}) as {
      credential_id?: string;
      tags?: string[];
      project_ids?: string[];
    };
    return {
      credential_id: organization.credential_id ?? data.id,
      tags: Array.isArray(organization.tags) ? organization.tags : [],
      project_ids: Array.isArray(organization.project_ids) ? organization.project_ids : [],
    };
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
