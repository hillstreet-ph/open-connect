/**
 * Open-Connect gateway server helpers.
 * Server-only: never import from client code.
 *
 * Production model plane (single client-facing gateway):
 *   Client → https://open-connect.site/v1 + oc_live_ key
 *         → OpenRouter (multi-provider: OpenAI, Claude, Gemini, …)
 *         → optional self-hosted LiteLLM if LITELLM_BASE_URL is not openrouter.ai
 *
 * Env (Cloudflare Pages secrets — never commit):
 *   LITELLM_BASE_URL   e.g. https://openrouter.ai/api/v1
 *   LITELLM_MASTER_KEY OpenRouter sk-or-v1-… (or LiteLLM master key)
 *   OPENROUTER_API_KEY optional explicit OpenRouter key
 *   OPENROUTER_BASE_URL optional override
 */
import { createHash, randomBytes } from "crypto";

export const KEY_PREFIX = "oc_live_";

export type UpstreamName = "openrouter" | "litellm";

export type Upstream = {
  name: UpstreamName;
  baseUrl: string;
  headers: Record<string, string>;
};

export const MODEL_ALIASES: Record<string, string> = {
  "open-connect/fast": "openai/gpt-4o-mini",
  "open-connect/balanced": "openai/gpt-4o-mini",
  "open-connect/reasoning": "openai/gpt-4o",
  "open-connect/coding": "openai/gpt-4o",
  "open-connect/vision": "openai/gpt-4o",
  "open-connect/claude": "anthropic/claude-sonnet-4",
  "open-connect/gemini": "google/gemini-2.5-flash",

  fast: "openai/gpt-4o-mini",
  balanced: "openai/gpt-4o-mini",
  reasoning: "openai/gpt-4o",
  coding: "openai/gpt-4o",
  vision: "openai/gpt-4o",
  embedding: "openai/text-embedding-3-small",

  "gpt-4o": "openai/gpt-4o",
  "gpt-4o-mini": "openai/gpt-4o-mini",
  "gpt-4.1": "openai/gpt-4.1",
  "gpt-4.1-mini": "openai/gpt-4.1-mini",
  "gpt-4.1-nano": "openai/gpt-4.1-nano",
  o1: "openai/o1",
  "o1-mini": "openai/o1-mini",
  "o3-mini": "openai/o3-mini",
  "openai/gpt-4o": "openai/gpt-4o",
  "openai/gpt-4o-mini": "openai/gpt-4o-mini",

  "claude-sonnet": "anthropic/claude-sonnet-4",
  "claude-sonnet-4": "anthropic/claude-sonnet-4",
  "claude-3.5-sonnet": "anthropic/claude-3.5-sonnet",
  "claude-3-opus": "anthropic/claude-3-opus",
  "claude-3-haiku": "anthropic/claude-3-haiku",
  "anthropic/claude-sonnet-4": "anthropic/claude-sonnet-4",
  "anthropic/claude-3.5-sonnet": "anthropic/claude-3.5-sonnet",

  "gemini-2.5-flash": "google/gemini-2.5-flash",
  "gemini-2.5-pro": "google/gemini-2.5-pro",
  "gemini-flash": "google/gemini-2.5-flash",
  "google/gemini-2.5-flash": "google/gemini-2.5-flash",
  "google/gemini-2.5-pro": "google/gemini-2.5-pro",

  "llama-3.3-70b": "meta-llama/llama-3.3-70b-instruct",
  "deepseek-chat": "deepseek/deepseek-chat",
  "mistral-large": "mistralai/mistral-large",
  "grok-2": "x-ai/grok-2-1212",
};

export const MANAGED_MODEL_IDS: string[] = [
  ...Object.keys(MODEL_ALIASES),
  ...Object.values(MODEL_ALIASES),
  "openai/gpt-4o",
  "openai/gpt-4o-mini",
  "openai/gpt-4.1",
  "openai/gpt-4.1-mini",
  "openai/o1",
  "openai/o1-mini",
  "openai/o3-mini",
  "openai/text-embedding-3-small",
  "anthropic/claude-sonnet-4",
  "anthropic/claude-3.5-sonnet",
  "anthropic/claude-3-opus",
  "anthropic/claude-3-haiku",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-pro",
  "meta-llama/llama-3.3-70b-instruct",
  "deepseek/deepseek-chat",
  "mistralai/mistral-large",
  "x-ai/grok-2-1212",
];

export function resolveModelId(requested: string): string {
  return MODEL_ALIASES[requested] ?? requested;
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function isOpenRouterBase(url: string): boolean {
  return !url || url.includes("openrouter.ai");
}

/**
 * Resolve upstreams for catalog + chat.
 * Production default: LITELLM_* → OpenRouter (one credential, all providers).
 */
export function resolveUpstreams(): Upstream[] {
  const list: Upstream[] = [];
  const seen = new Set<string>();
  const appUrl = process.env["VITE_APP_URL"] ?? "https://open-connect.site";

  const liteBaseRaw = process.env["LITELLM_BASE_URL"] || "";
  const liteKey = process.env["LITELLM_MASTER_KEY"] || "";
  const explicitOrKey = process.env["OPENROUTER_API_KEY"] || "";
  const explicitOrBase = process.env["OPENROUTER_BASE_URL"] || "";

  // --- OpenRouter (multi-provider) ---
  const orKey =
    explicitOrKey ||
    (isOpenRouterBase(liteBaseRaw) && liteKey ? liteKey : "") ||
    (!liteBaseRaw && liteKey ? liteKey : "");

  const orBase = stripTrailingSlash(
    explicitOrBase ||
      (isOpenRouterBase(liteBaseRaw) && liteBaseRaw
        ? liteBaseRaw
        : "https://openrouter.ai/api/v1"),
  );

  if (orKey) {
    const id = `openrouter:${orBase}`;
    if (!seen.has(id)) {
      seen.add(id);
      list.push({
        name: "openrouter",
        baseUrl: orBase,
        headers: {
          Authorization: `Bearer ${orKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": appUrl,
          "X-Title": "Open-Connect",
        },
      });
    }
  }

  // --- Self-hosted LiteLLM proxy (optional) ---
  if (liteKey && liteBaseRaw && !isOpenRouterBase(liteBaseRaw)) {
    const liteBase = stripTrailingSlash(liteBaseRaw);
    const id = `litellm:${liteBase}`;
    if (!seen.has(id)) {
      seen.add(id);
      list.push({
        name: "litellm",
        baseUrl: liteBase,
        headers: {
          Authorization: `Bearer ${liteKey}`,
          "Content-Type": "application/json",
        },
      });
    }
  }

  return list;
}

export function resolveUpstream(): Upstream | null {
  return resolveUpstreams()[0] ?? null;
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
  if (cached && now - cached.at < AUTH_TTL_MS) return cached.key;

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

  void supabaseAdmin
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);

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
    // ignore audit failures
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

/** Full catalog: managed aliases + every model from connected upstream credentials. */
export async function fetchMergedModelCatalog(): Promise<{
  ids: string[];
  upstreams: string[];
  providers: string[];
}> {
  const upstreams = resolveUpstreams();
  const ids = new Set<string>(MANAGED_MODEL_IDS);
  const names: string[] = [];
  const providers = new Set<string>();

  await Promise.all(
    upstreams.map(async (u) => {
      names.push(u.name);
      try {
        const response = await fetch(`${u.baseUrl}/models`, {
          headers: u.headers,
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) return;
        const payload = (await response.json().catch(() => null)) as {
          data?: { id?: string }[];
        } | null;
        const data = payload?.data;
        if (!Array.isArray(data)) return;
        for (const m of data) {
          if (m && typeof m.id === "string" && m.id.length > 0) {
            ids.add(m.id);
            const slash = m.id.indexOf("/");
            if (slash > 0) providers.add(m.id.slice(0, slash));
          }
        }
      } catch {
        // keep managed list
      }
    }),
  );

  return {
    ids: [...ids].sort(),
    upstreams: names,
    providers: [...providers].sort(),
  };
}
