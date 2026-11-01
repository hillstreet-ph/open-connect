import { resourceAllowsRequest } from "./mcp-oauth-contract.ts";
import { collectAutoFreeRoutes } from "./auto-free-routing.ts";
import { COMPATIBLE_GATEWAY_PROVIDERS } from "./ai-gateway-providers.ts";
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
 *   FIREWORKS_API_KEY  optional Fireworks AI platform key (OpenAI-compatible inference)
 *   FIREWORKS_BASE_URL defaults to https://api.fireworks.ai/inference/v1
 */
import { createHash } from "crypto";
import { generateClientKey, isClientKey } from "./gateway-keys.ts";
import { fetchFreeModelCatalog, isAutoFreeModel } from "./model-catalog";
import { orderOpenAutoRoutes } from "./open-auto-router.ts";

export const KEY_PREFIX = "oc_live_";

export type UpstreamName = import("./model-connection.server").SavedModelUpstream["name"];

export type Upstream = {
  name: UpstreamName;
  baseUrl: string;
  headers: Record<string, string>;
};

/** OpenRouter :free models — rotate for open-connect/free-rotate */
export const FREE_MODEL_POOL: string[] = [
  "openrouter/free",
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "nvidia/nemotron-3.5-lightning:free",
  "liquid/lfm-2.5-2.6b:free",
  "thinkingmachines/inkling:free",
  "thinkingmachines/inkling-small:free",
  "poolside/laguna-s-2.1:free",
  "poolside/laguna-xs-2.1:free",
  "cohere/north-mini-code:free",
  "nex-agi/nex-n2.5-mini:free",
  "nex-agi/nex-n2.5-pro:free",
  "inclusionai/ling-3.0-flash-sante:free",
  "inclusionai/ling-3.0-flash-fin:free",
];

let freeRotateIdx = 0;

/** Prefer OpenRouter official free auto-router; else round-robin pool. */
export function nextFreeModel(preferAutoRouter = true): string {
  if (preferAutoRouter) return "openrouter/free";
  const pool = FREE_MODEL_POOL.filter((id) => id !== "openrouter/free");
  if (!pool.length) return "openrouter/free";
  const id = pool[freeRotateIdx % pool.length]!;
  freeRotateIdx += 1;
  return id;
}

export const MODEL_ALIASES: Record<string, string> = {
  // Free tier (OpenRouter)
  auto: "openrouter/free",
  "open-connect/auto": "openrouter/free",
  "open-connect/free": "openrouter/free",
  "open-connect/auto-free": "openrouter/free",
  free: "openrouter/free",
  "openrouter/free": "openrouter/free",

  // --- Open-Auto (pyramid default: needs-based selection across providers) ---
  "open-connect/open-auto": "openrouter/auto",
  "open-auto": "openrouter/auto",

  // --- Open-Connect virtual (stable for agents) ---
  "open-connect/high": "openai/gpt-4o",
  "open-connect/deep": "openai/o3-mini",
  "open-connect/wide": "openrouter/auto",
  "open-connect/fast": "openai/gpt-4o-mini",
  "open-connect/cheap": "openai/gpt-4o-mini",
  "open-connect/balanced": "openai/gpt-4o-mini",
  "open-connect/reasoning": "openai/gpt-4o",
  "open-connect/coding": "openai/gpt-4o",
  "open-connect/vision": "openai/gpt-4o",
  "open-connect/claude": "anthropic/claude-sonnet-4",
  "open-connect/claude-fast": "anthropic/claude-3-haiku",
  "open-connect/gemini": "google/gemini-2.5-flash",
  "open-connect/gemini-pro": "google/gemini-2.5-pro",
  "open-connect/grok": "x-ai/grok-2-1212",
  "open-connect/llama": "meta-llama/llama-3.3-70b-instruct",
  "open-connect/deepseek": "deepseek/deepseek-chat",
  "open-connect/mistral": "mistralai/mistral-large",
  "open-connect/embedding": "openai/text-embedding-3-small",

  // --- Short logical names (LiteLLM-style) ---
  high: "openai/gpt-4o",
  deep: "openai/o3-mini",
  wide: "openrouter/auto",
  fast: "openai/gpt-4o-mini",
  cheap: "openai/gpt-4o-mini",
  balanced: "openai/gpt-4o-mini",
  reasoning: "openai/gpt-4o",
  coding: "openai/gpt-4o",
  vision: "openai/gpt-4o",
  embedding: "openai/text-embedding-3-small",

  // --- OpenAI ---
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
  "openai/gpt-4.1": "openai/gpt-4.1",
  "openai/o1": "openai/o1",
  "openai/text-embedding-3-small": "openai/text-embedding-3-small",
  "openai/text-embedding-3-large": "openai/text-embedding-3-large",

  // --- Anthropic / Claude ---
  "claude-sonnet": "anthropic/claude-sonnet-4",
  "claude-sonnet-4": "anthropic/claude-sonnet-4",
  "claude-3.5-sonnet": "anthropic/claude-3.5-sonnet",
  "claude-3-opus": "anthropic/claude-3-opus",
  "claude-3-haiku": "anthropic/claude-3-haiku",
  "claude-opus": "anthropic/claude-3-opus",
  "claude-haiku": "anthropic/claude-3-haiku",
  "anthropic/claude-sonnet-4": "anthropic/claude-sonnet-4",
  "anthropic/claude-3.5-sonnet": "anthropic/claude-3.5-sonnet",
  "anthropic/claude-3-opus": "anthropic/claude-3-opus",
  "anthropic/claude-3-haiku": "anthropic/claude-3-haiku",

  // --- Google / Gemini ---
  "gemini-2.5-flash": "google/gemini-2.5-flash",
  "gemini-2.5-pro": "google/gemini-2.5-pro",
  "gemini-flash": "google/gemini-2.5-flash",
  "gemini-pro": "google/gemini-2.5-pro",
  "google/gemini-2.5-flash": "google/gemini-2.5-flash",
  "google/gemini-2.5-pro": "google/gemini-2.5-pro",

  // --- Meta / DeepSeek / Mistral / xAI ---
  "llama-3.3-70b": "meta-llama/llama-3.3-70b-instruct",
  "meta-llama/llama-3.3-70b-instruct": "meta-llama/llama-3.3-70b-instruct",
  "deepseek-chat": "deepseek/deepseek-chat",
  "deepseek/deepseek-chat": "deepseek/deepseek-chat",
  "mistral-large": "mistralai/mistral-large",
  "mistralai/mistral-large": "mistralai/mistral-large",
  "grok-2": "x-ai/grok-2-1212",
  "x-ai/grok-2-1212": "x-ai/grok-2-1212",
};

export const MANAGED_MODEL_IDS: string[] = Array.from(
  new Set([...Object.keys(MODEL_ALIASES), ...Object.values(MODEL_ALIASES), ...FREE_MODEL_POOL]),
);

export function resolveModelId(requested: string): string {
  const key = (requested || "").trim();
  if (!key) return nextFreeModel(true);

  if (
    key === "open-connect/rotate-free" ||
    key === "open-connect/free-rotate" ||
    key === "free-rotate"
  ) {
    return nextFreeModel(false);
  }

  if (key === "open-connect/free" || key === "free" || key === "open-connect/auto-free") {
    return "openrouter/free";
  }

  if (key.endsWith(":free") || key === "openrouter/free") {
    return key;
  }

  return MODEL_ALIASES[key] ?? key;
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

  const orKey =
    explicitOrKey ||
    (isOpenRouterBase(liteBaseRaw) && liteKey ? liteKey : "") ||
    (!liteBaseRaw && liteKey ? liteKey : "");

  const orBase = stripTrailingSlash(
    explicitOrBase ||
      (isOpenRouterBase(liteBaseRaw) && liteBaseRaw ? liteBaseRaw : "https://openrouter.ai/api/v1"),
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

  const fireworksKey = process.env["FIREWORKS_API_KEY"] || "";
  const fireworksBase = stripTrailingSlash(
    process.env["FIREWORKS_BASE_URL"] || "https://api.fireworks.ai/inference/v1",
  );
  if (fireworksKey) {
    const id = `fireworks:${fireworksBase}`;
    if (!seen.has(id)) {
      seen.add(id);
      list.push({
        name: "fireworks",
        baseUrl: fireworksBase,
        headers: {
          Authorization: `Bearer ${fireworksKey}`,
          "Content-Type": "application/json",
        },
      });
    }
  }

  return list;
}

export async function resolveUserUpstreams(
  userId: string,
  allowPlatformFallback = true,
): Promise<Upstream[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { savedModelUpstreams } = await import("./model-connection.server");
  // Generated database types lag the deployed credential resolver RPC.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;
  const { data: connections, error: connectionError } = await db
    .from("app_connections")
    .select("provider,status,credential_reference,metadata")
    .eq("user_id", userId)
    .in(
      "provider",
      COMPATIBLE_GATEWAY_PROVIDERS.map((provider) => provider.id),
    )
    .eq("status", "connected")
    .order("created_at", { ascending: false });
  if (connectionError) throw new Error("Unable to read model connection.");
  const saved = await savedModelUpstreams(userId, {
    find: async () => connections ?? [],
    resolve: async (id, credentialId) => {
      const { data, error } = await db.rpc("resolve_connection_credential", {
        p_user_id: id,
        p_credential_id: credentialId,
      });
      if (error || typeof data !== "string") throw new Error("Unable to resolve model credential.");
      return data;
    },
  });
  // A saved personal connection is authoritative: no silent fallback to a different account.
  return saved.length > 0 || (connections?.length ?? 0) > 0
    ? saved
    : allowPlatformFallback
      ? resolveUpstreams()
      : [];
}

export type AutoFreeRoute = { upstream: Upstream; model: string };

const AUTO_FREE_CATALOG_TTL_MS = 60_000;
const autoFreeCatalogCache = new Map<string, { expiresAt: number; ids: string[] }>();

/** Build free-only fallback routes from the current user's connected model gateways. */
export async function resolveAutoFreeRoutes(upstreams: Upstream[]): Promise<AutoFreeRoute[]> {
  return collectAutoFreeRoutes(upstreams, async (upstream) => {
    const cacheKey = createHash("sha256")
      .update(`${upstream.name}\n${upstream.baseUrl}\n${upstream.headers["Authorization"] ?? ""}`)
      .digest("hex");
    let catalog = autoFreeCatalogCache.get(cacheKey);
    if (!catalog || catalog.expiresAt <= Date.now()) {
      const models = await fetchFreeModelCatalog([upstream]);
      catalog = {
        expiresAt: Date.now() + AUTO_FREE_CATALOG_TTL_MS,
        ids: models.map((model) => model.id),
      };
      autoFreeCatalogCache.set(cacheKey, catalog);
    }
    return catalog.ids;
  });
}

export { isAutoFreeModel };

/**
 * Detect every upstream catalog concurrently and order routes free first (Open-Auto).
 * New upstream models appear automatically because catalogs are read at request time.
 */
export async function resolveOpenAutoRoutes(upstreams: Upstream[]): Promise<AutoFreeRoute[]> {
  const catalogs = await Promise.all(
    upstreams.map(async (upstream) => {
      try {
        const response = await fetch(`${upstream.baseUrl}/models`, {
          headers: upstream.headers,
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) return [] as string[];
        const payload = (await response.json().catch(() => null)) as {
          data?: { id?: string }[];
        } | null;
        const data = payload?.data;
        if (!Array.isArray(data)) return [] as string[];
        return data
          .map((model) => (model && typeof model.id === "string" ? model.id : ""))
          .filter((id) => id.length > 0);
      } catch {
        return [] as string[];
      }
    }),
  );
  return orderOpenAutoRoutes(
    upstreams.flatMap((upstream, index) =>
      catalogs[index]!.map((model) => ({ upstream, model })),
    ),
  );
}
export function resolveUpstream(): Upstream | null {
  return resolveUpstreams()[0] ?? null;
}

export function hashKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

export function generateKey(modelOnly = false): { raw: string; hash: string; prefix: string } {
  return generateClientKey(modelOnly);
}

export type AuthedKey = {
  id: string;
  userId: string;
  scopes: string[];
  organizationId: string | null;
  workspaceId: string | null;
  projectId: string | null;
  accessProfile: string;
};

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
  if (!raw || !isClientKey(raw)) return null;

  // Verify every request so deleted/revoked keys never survive in an instance cache.
  const { oauthDatabase } = await import("@/lib/oauth-client.server");
  const { data, error } = await oauthDatabase().rpc("oc_verify_gateway_key", { p_key: raw });
  if (error || !data || !resourceAllowsRequest(data.oauth_resource, request.url)) return null;
  const key: AuthedKey = {
    id: data.id,
    userId: data.user_id,
    scopes: data.scopes ?? [],
    organizationId: data.organization_id ?? null,
    workspaceId: data.workspace_id ?? null,
    projectId: data.project_id ?? null,
    accessProfile: data.access_profile ?? "legacy",
  };
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
export async function fetchMergedModelCatalog(configured?: Upstream[]): Promise<{
  ids: string[];
  upstreams: string[];
  providers: string[];
}> {
  const upstreams = configured ?? resolveUpstreams();
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
            providers.add(slash > 0 ? m.id.slice(0, slash) : u.name);
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
