import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const SECRET_SCOPES = [
  "resources",
  "connections",
  "models",
  "mcp",
  "secrets",
  "agents",
] as const;

export type SecretScope = (typeof SECRET_SCOPES)[number];
export type SecretType =
  | "api_key"
  | "oauth_token"
  | "mcp_url"
  | "bot_token"
  | "password"
  | "totp"
  | "other";

export const listSecrets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("list_credential_secrets");
    if (error) throw new Error(error.message);
    return Array.isArray(data) ? data : [];
  });

export const createSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { name: string; secret_type?: string; scopes?: string[]; secret_value: string }) => ({
      name: (input?.name ?? "").trim().slice(0, 120),
      secret_type: (input?.secret_type ?? "api_key") as SecretType,
      scopes: Array.isArray(input?.scopes)
        ? input.scopes.filter((s) => SECRET_SCOPES.includes(s as SecretScope))
        : [],
      secret_value: (input?.secret_value ?? "").trim(),
    }),
  )
  .handler(async ({ data, context }) => {
    if (!data.name) throw new Error("Name required");
    if (!data.secret_value || data.secret_value.length < 4) {
      throw new Error("Secret value required (min 4 characters)");
    }

    const { data: row, error } = await context.supabase.rpc("create_credential_secret", {
      p_name: data.name,
      p_secret_type: data.secret_type,
      p_scopes: data.scopes,
      p_secret_value: data.secret_value,
    });

    if (error) throw new Error(error.message);
    return row;
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
