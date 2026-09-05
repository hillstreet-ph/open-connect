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
export type SecretType = "api_key" | "oauth_token" | "mcp_url" | "bot_token" | "password" | "other";

export const listSecrets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("credential_secrets")
      .select("id, name, secret_type, scopes, last_used_at, created_at, updated_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      ...row,
      // never expose secret_value in list
    }));
  });

export const createSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      name: string;
      secret_type?: string;
      scopes?: string[];
      secret_value: string;
    }) => ({
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

    const { data: row, error } = await context.supabase
      .from("credential_secrets")
      .insert({
        user_id: context.userId,
        name: data.name,
        secret_type: data.secret_type,
        scopes: data.scopes,
        secret_value: data.secret_value,
      })
      .select("id, name, secret_type, scopes, created_at")
      .single();

    if (error) throw new Error(error.message);
    return row;
  });

export const deleteSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: (input?.id ?? "").trim() }))
  .handler(async ({ data, context }) => {
    if (!data.id) throw new Error("id required");
    const { error } = await context.supabase
      .from("credential_secrets")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
