/**
 * Cloudflare Workers KV integration for Open-Connect (Pages / TanStack Start).
 *
 * Binding name: OC_KV (see wrangler.toml)
 * Access pattern: env from cloudflare:workers when available.
 *
 * Good uses at the edge:
 *  - OAuth auth-code one-time use markers
 *  - Short-lived rate limits / abuse counters
 *  - Feature flags / maintenance mode
 *  - Cache of non-sensitive gateway metadata
 *
 * Not for: long-term secrets, user PII, or as a substitute for Supabase.
 */

type KvLike = {
  get(key: string, type?: "text"): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
};

type CloudflareEnv = {
  OC_KV?: KvLike;
};

async function getCloudflareEnv(): Promise<CloudflareEnv | null> {
  try {
    // Available in Cloudflare Workers / Pages runtime with nodejs_compat + bindings
    const mod = await import("cloudflare:workers");
    return (mod as { env?: CloudflareEnv }).env ?? null;
  } catch {
    return null;
  }
}

/** Returns the OC_KV namespace, or null if unbound / not on Cloudflare. */
export async function getKv(): Promise<KvLike | null> {
  const env = await getCloudflareEnv();
  return env?.OC_KV ?? null;
}

export async function kvGet(key: string): Promise<string | null> {
  const kv = await getKv();
  if (!kv) return null;
  try {
    return await kv.get(key, "text");
  } catch (e) {
    console.warn("[kv] get failed", key, e);
    return null;
  }
}

export async function kvPut(
  key: string,
  value: string,
  ttlSeconds?: number,
): Promise<boolean> {
  const kv = await getKv();
  if (!kv) return false;
  try {
    await kv.put(key, value, ttlSeconds ? { expirationTtl: ttlSeconds } : undefined);
    return true;
  } catch (e) {
    console.warn("[kv] put failed", key, e);
    return false;
  }
}

export async function kvDelete(key: string): Promise<boolean> {
  const kv = await getKv();
  if (!kv) return false;
  try {
    await kv.delete(key);
    return true;
  } catch (e) {
    console.warn("[kv] delete failed", key, e);
    return false;
  }
}

/** Mark an OAuth authorization code as consumed (one-time use). TTL ~15 min. */
export async function markAuthCodeUsed(codeId: string): Promise<void> {
  await kvPut(`oauth:code:used:${codeId}`, "1", 15 * 60);
}

export async function isAuthCodeUsed(codeId: string): Promise<boolean> {
  const v = await kvGet(`oauth:code:used:${codeId}`);
  return v === "1";
}

/** Simple fixed-window rate limit. Returns true if under limit. */
export async function rateLimitAllow(
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const key = `rl:${bucket}`;
  const raw = await kvGet(key);
  const count = raw ? Number.parseInt(raw, 10) || 0 : 0;
  if (count >= limit) return false;
  await kvPut(key, String(count + 1), windowSeconds);
  return true;
}

export async function kvHealth(): Promise<{ bound: boolean; writable: boolean }> {
  const kv = await getKv();
  if (!kv) return { bound: false, writable: false };
  const ok = await kvPut("oc:health:ping", String(Date.now()), 60);
  return { bound: true, writable: ok };
}
