import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Full autonomous surface for oc_live_ keys.
 * New keys auto-grant all product scopes so ChatGPT / Claude / Grok / Open WebUI
 * / Pipedream / Composio agents work without manual scope picking.
 */
export const DEFAULT_KEY_SCOPES = [
  "openid",
  "mcp:connect",
  "resources:read",
  "resources:write",
  "connections:read",
  "connections:invoke",
  "models:read",
  "models:invoke",
  "tools:invoke",
  "secrets:read",
  "agents:invoke",
] as const;

export const listApiKeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("api_keys")
      .select("id, name, key_prefix, scopes, last_used_at, revoked_at, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name?: string }) => ({
    name: (input?.name ?? "").trim() || "Default key",
  }))
  .handler(async ({ data, context }) => {
    const { generateKey } = await import("./gateway.server");
    const key = generateKey();
    const { error } = await context.supabase.from("api_keys").insert({
      user_id: context.userId,
      name: data.name,
      key_prefix: key.prefix,
      key_hash: key.hash,
      scopes: [...DEFAULT_KEY_SCOPES],
    });
    if (error) throw new Error(error.message);
    return { key: key.raw, scopes: [...DEFAULT_KEY_SCOPES] };
  });

export const revokeApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: input.id }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
