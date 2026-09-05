/**
 * Open-Connect gateway server helpers.
 * Server-only: never import from client code.
 */
import { createHash, randomBytes } from "crypto";

export const KEY_PREFIX = "oc_live_";

export type Upstream = {
  name: "litellm" | "openrouter";
  baseUrl: string;
  headers: Record<string, string>;
};

/** Aliases prefer OpenAI/Anthropic routes that work on OpenRouter without Google Cloud billing. */
export const MODEL_ALIASES: Record<string, string> = {
  "open-connect/fast": "openai/gpt-4o-mini",
  "open-connect/balanced": "openai/gpt-4o-mini",
  "open-connect/reasoning": "openai/gpt-4o",
  "open-connect/coding": "openai/gpt-4o",
  "open-connect/vision": "openai/gpt-4o",
};

export function resolveModelId(requested: string): string {
  return MODEL_ALIASES[requested] ?? requested;
}

export function resolveUpstream(): Upstream | null {
  const liteKey =
    process.env["LITELLM_MASTER_KEY"] ||
    process.env["OPENROUTER_API_KEY"] ||
    "";
  if (!liteKey) return null;

  const liteBase =
    process.env["LITELLM_BASE_URL"] ||
    process.env["OPENROUTER_BASE_URL"] ||
    "https://openrouter.ai/api/v1";

  const isOpenRouter = liteBase.includes("openrouter.ai");
  return {
    name: isOpenRouter ? "openrouter" : "litellm",
    baseUrl: liteBase.replace(/\/+$/, ""),
    headers: {
      Authorization: `Bearer ${liteKey}`,
      "Content-Type": "application/json",
      ...(isOpenRouter
        ? {
            "HTTP-Referer": process.env["VITE_APP_URL"] ?? "https://open-connect.site",
            "X-Title": "Open-Connect",
          }
        : {}),
    },
  };
}

export function hashKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

export function generateKey(): { raw: string; hash: string; prefix: string } {
  const raw = `${KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
  return { raw, hash: hashKey(raw), prefix: raw.slice(0, KEY_PREFIX.length + 6) };
}

export type AuthedKey = { id: string; userId: string; scopes: string[] };

const AUTH_TTL_MS = 30_000;
const authCache = new Map<string, { at: number; key: AuthedKey | null }>();

export function readBearer(request: Request): string | null {
  const header = request.headers.get("authorization") ?? request.headers.get("x-api-key");
  if (!header) return null;
  const value = header.startsWith("Bearer ") ? header.slice(7) : header;
  return value.trim() || null;
}

export function hasScope(key: AuthedKey, scope: string): boolean {
  return key.scopes.includes(scope) || key.scopes.includes("*");
}

export async function authenticateKey(request: Request): Promise<AuthedKey | null> {
  const raw = readBearer(request);
  if (!raw || !raw.startsWith(KEY_PREFIX)) return null;

  const digest = hashKey(raw);
  const now = Date.now();
  const cached = authCache.get(digest);
  if (cached && now - cached.at < AUTH_TTL_MS) {
    return cached.key;
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("api_keys")
    .select("id, user_id, scopes, revoked_at")
    .eq("key_hash", digest)
    .maybeSingle();

  if (!data || data.revoked_at) {
    authCache.set(digest, { at: now, key: null });
    return null;
  }

  const key: AuthedKey = {
    id: data.id,
    userId: data.user_id,
    scopes: data.scopes ?? [],
  };
  authCache.set(digest, { at: now, key });

  // Throttle last_used writes (only when cache misses)
  void supabaseAdmin
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);

  // Bound map size on busy isolates
  if (authCache.size > 500) {
    const oldest = authCache.keys().next().value;
    if (oldest) authCache.delete(oldest);
  }

  return key;
}

export async function logGatewayRequest(entry: {
  key: AuthedKey;
  endpoint: string;
  model?: string | null;
  statusCode: number;
  upstream: string;
  totalTokens?: number | null;
}): Promise<void> {
  try {
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
  } catch {
    // never fail the request on audit log errors
  }
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
