/**
 * Open-Connect gateway server helpers.
 *
 * Resolves the model upstream (LiteLLM when configured, Lovable AI otherwise),
 * verifies scoped Open-Connect keys and records gateway usage.
 * Server-only: never import this from client code.
 */
import { createHash, randomBytes } from "crypto";

export const KEY_PREFIX = "oc_live_";

export type Upstream = {
  name: "litellm" | "lovable-ai";
  baseUrl: string;
  headers: Record<string, string>;
};

export function resolveUpstream(): Upstream | null {
  const liteBase = process.env["LITELLM_BASE_URL"];
  const liteKey = process.env["LITELLM_MASTER_KEY"];
  if (liteBase && liteKey) {
    return {
      name: "litellm",
      baseUrl: liteBase.replace(/\/+$/, ""),
      headers: {
        Authorization: `Bearer ${liteKey}`,
        "Content-Type": "application/json",
      },
    };
  }

  const lovableKey = process.env["LOVABLE_API_KEY"];
  if (lovableKey) {
    return {
      name: "lovable-ai",
      baseUrl: "https://ai.gateway.lovable.dev/v1",
      headers: {
        "Lovable-API-Key": lovableKey,
        "X-Lovable-AIG-SDK": "fetch",
        "Content-Type": "application/json",
      },
    };
  }

  return null;
}

export function hashKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

export function generateKey(): { raw: string; hash: string; prefix: string } {
  const raw = `${KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
  return { raw, hash: hashKey(raw), prefix: raw.slice(0, KEY_PREFIX.length + 6) };
}

export type AuthedKey = { id: string; userId: string; scopes: string[] };

export function readBearer(request: Request): string | null {
  const header = request.headers.get("authorization") ?? request.headers.get("x-api-key");
  if (!header) return null;
  const value = header.startsWith("Bearer ") ? header.slice(7) : header;
  return value.trim() || null;
}

export async function authenticateKey(request: Request): Promise<AuthedKey | null> {
  const raw = readBearer(request);
  if (!raw || !raw.startsWith(KEY_PREFIX)) return null;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("api_keys")
    .select("id, user_id, scopes, revoked_at")
    .eq("key_hash", hashKey(raw))
    .maybeSingle();

  if (!data || data.revoked_at) return null;

  void supabaseAdmin
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);

  return { id: data.id, userId: data.user_id, scopes: data.scopes ?? [] };
}

export async function logGatewayRequest(entry: {
  key: AuthedKey;
  endpoint: string;
  model?: string | null;
  statusCode: number;
  upstream: string;
  totalTokens?: number | null;
}): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("gateway_requests").insert({
    api_key_id: entry.key.id,
    user_id: entry.key.userId,
    endpoint: entry.endpoint,
    model: entry.model ?? null,
    status_code: entry.statusCode,
    upstream: entry.upstream,
    total_tokens: entry.totalTokens ?? null,
  });
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function gatewayError(message: string, status: number, code: string): Response {
  return json({ error: { message, type: "open_connect_error", code } }, status);
}
