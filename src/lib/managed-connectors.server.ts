type AuthConfigMap = Record<string, string>;

function authConfigs(): AuthConfigMap {
  const raw = process.env["COMPOSIO_AUTH_CONFIGS"]?.trim();
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        ([provider, id]) =>
          provider.length > 0 && typeof id === "string" && id.startsWith("ac_"),
      ),
    );
  } catch {
    return {};
  }
}

function composioApiKey() {
  return process.env["COMPOSIO_API_KEY"]?.trim() || "";
}

export function managedConnectorReady(provider: string): boolean {
  return Boolean(composioApiKey() && authConfigs()[provider]);
}

export type ComposioToolkit = {
  slug: string;
  name: string;
  category: string;
  authMethods: string[];
};

let toolkitCatalogCache:
  { expiresAt: number; items: ComposioToolkit[] } | undefined;

function toolkitCategory(value: unknown): string {
  const categories = Array.isArray(value) ? value : [];
  const name = categories
    .map((item) =>
      typeof item === "string" ? item : (item as { name?: string })?.name,
    )
    .find(
      (item): item is string =>
        typeof item === "string" && item.trim().length > 0,
    );
  return name
    ? name
        .replaceAll("_", " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase())
    : "Composio";
}

function toolkitAuthMethods(toolkit: Record<string, unknown>): string[] {
  const value =
    toolkit["composio_managed_auth_schemes"] ??
    toolkit["auth_schemes"] ??
    toolkit["authSchemes"];
  const schemes = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? Object.keys(value)
      : [];
  return [
    ...new Set(
      schemes
        .map((item) =>
          typeof item === "string"
            ? item
            : ((item as { auth_scheme?: string; name?: string })?.auth_scheme ??
              (item as { name?: string })?.name),
        )
        .filter(
          (item): item is string => typeof item === "string" && item.length > 0,
        )
        .map((item) => item.toUpperCase()),
    ),
  ];
}

export async function listComposioToolkits(): Promise<ComposioToolkit[]> {
  if (!composioApiKey()) return [];
  if (toolkitCatalogCache && toolkitCatalogCache.expiresAt > Date.now())
    return toolkitCatalogCache.items;
  const apiKey = composioApiKey();
  const items: ComposioToolkit[] = [];
  const cursors = new Set<string>();
  let cursor = "";
  do {
    const query = new URLSearchParams({ managed_by: "all", limit: "1000" });
    if (cursor) query.set("cursor", cursor);
    const page = await composioRequest<{
      items?: Array<Record<string, unknown>>;
      next_cursor?: string | null;
    }>(`/toolkits?${query}`, apiKey);
    for (const raw of page.items ?? []) {
      const slug =
        typeof raw["slug"] === "string" ? raw["slug"].trim().toLowerCase() : "";
      const name = typeof raw["name"] === "string" ? raw["name"].trim() : "";
      if (
        !slug ||
        !name ||
        raw["is_enabled"] === false ||
        raw["enabled"] === false
      )
        continue;
      items.push({
        slug,
        name,
        category: toolkitCategory(
          raw["categories"] ??
            (raw["meta"] as { categories?: unknown } | undefined)?.categories ??
            raw["category"],
        ),
        authMethods: toolkitAuthMethods(raw),
      });
    }
    cursor = page.next_cursor ?? "";
    if (cursor && cursors.has(cursor))
      throw new Error("Composio toolkit pagination did not advance.");
    if (cursor) cursors.add(cursor);
    if (cursors.size > 100)
      throw new Error("Composio toolkit pagination limit reached.");
  } while (cursor);
  const unique = [...new Map(items.map((item) => [item.slug, item])).values()];
  toolkitCatalogCache = { expiresAt: Date.now() + 15 * 60_000, items: unique };
  return unique;
}

async function authConfigForToolkit(
  toolkitSlug: string,
  apiKey: string,
): Promise<string> {
  const query = new URLSearchParams({
    toolkit_slug: toolkitSlug,
    is_composio_managed: "true",
    limit: "50",
  });
  const listed = await composioRequest<{
    items?: Array<{
      id?: string;
      toolkit?: { slug?: string };
      is_composio_managed?: boolean;
    }>;
  }>(`/auth_configs?${query}`, apiKey);
  const existing = (listed.items ?? []).find(
    (item) =>
      item.id?.startsWith("ac_") &&
      item.toolkit?.slug?.toLowerCase() === toolkitSlug.toLowerCase() &&
      item.is_composio_managed !== false,
  );
  if (existing?.id) return existing.id;
  const created = await composioRequest<{ auth_config?: { id?: string } }>(
    "/auth_configs",
    apiKey,
    {
      method: "POST",
      body: JSON.stringify({
        toolkit: { slug: toolkitSlug },
        auth_config: { type: "use_composio_managed_auth" },
      }),
    },
  );
  if (!created.auth_config?.id?.startsWith("ac_"))
    throw new Error(
      `Could not create Composio authorization config for ${toolkitSlug}.`,
    );
  return created.auth_config.id;
}

async function composioRequest<T>(
  path: string,
  apiKey: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`https://backend.composio.dev/api/v3.1${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      ...init?.headers,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(
      payload.error?.message ||
        `Connector broker failed (HTTP ${response.status}).`,
    );
  }
  return payload as T;
}

export async function createManagedConnectionLink(input: {
  provider: string;
  userId: string;
  callbackUrl: string;
  alias?: string;
  toolkitSlug?: string;
}) {
  const apiKey = composioApiKey();
  if (!apiKey) throw new Error("Composio is not configured.");
  const authConfigId =
    authConfigs()[input.provider] ??
    (await authConfigForToolkit(input.toolkitSlug || input.provider, apiKey));
  return composioRequest<{
    redirect_url: string;
    connected_account_id: string;
    expires_at: string;
  }>("/connected_accounts/link", apiKey, {
    method: "POST",
    body: JSON.stringify({
      auth_config_id: authConfigId,
      user_id: input.userId,
      alias: input.alias || `open-connect-${input.provider}`,
      callback_url: input.callbackUrl,
      experimental: { account_type: "PRIVATE" },
    }),
  });
}

export async function getManagedConnection(
  _provider: string,
  connectedAccountId: string,
) {
  const apiKey = composioApiKey();
  if (!apiKey) throw new Error("Composio is not configured.");
  return composioRequest<{
    id?: string;
    status?: string;
    toolkit?: { slug?: string };
  }>(`/connected_accounts/${encodeURIComponent(connectedAccountId)}`, apiKey);
}

export async function deleteManagedConnection(
  _provider: string,
  connectedAccountId: string,
) {
  const apiKey = composioApiKey();
  if (!apiKey) throw new Error("Composio is not configured.");
  await composioRequest<unknown>(
    `/connected_accounts/${encodeURIComponent(connectedAccountId)}`,
    apiKey,
    { method: "DELETE" },
  );
}

/** Prefer an explicitly configured broker, retaining native/key fallbacks. */
export function connectionMethod(
  provider: string,
  oauth: boolean,
  managedReady: boolean,
) {
  if (managedReady) return "managed_oauth";
  if (provider === "github") return "native_oauth";
  return oauth ? "managed_oauth" : "api_key";
}

/** Identity aliases are provisioned by the deployment administrator, never by client input. */
export function managedIdentityIds(userId: string): string[] {
  const raw = process.env["COMPOSIO_USER_MAPPINGS"];
  if (!raw) return [userId];
  const mappings = JSON.parse(raw) as Record<string, unknown>;
  const mapped = mappings[userId];
  if (mapped === undefined) return [userId];
  if (
    !Array.isArray(mapped) ||
    mapped.some((id) => typeof id !== "string" || !id.trim())
  ) {
    throw new Error("Invalid Composio user mapping.");
  }
  return [...new Set([userId, ...(mapped as string[])])];
}

export async function listOwnedManagedConnections(userId: string) {
  const accounts = new Map<string, { id: string; provider: string }>();
  for (const identity of managedIdentityIds(userId)) {
    for (const account of await listManagedIdentityConnections(identity)) {
      accounts.set(account.id, account);
    }
  }
  return [...accounts.values()];
}

async function listManagedIdentityConnections(userId: string) {
  const apiKey = process.env["COMPOSIO_API_KEY"]?.trim();
  if (!apiKey) throw new Error("Composio is not configured.");
  if (!userId.trim()) throw new Error("A signed-in user is required.");
  const providers = new Map(
    Object.entries(authConfigs()).map(([provider, id]) => [id, provider]),
  );
  const aliases = JSON.parse(
    process.env["COMPOSIO_AUTH_CONFIG_ALIASES"] || "{}",
  ) as Record<string, string>;
  for (const [id, provider] of Object.entries(aliases)) {
    if (id.startsWith("ac_") && authConfigs()[provider])
      providers.set(id, provider);
  }
  const accounts = new Map<string, { id: string; provider: string }>();
  const cursors = new Set<string>();
  let cursor = "";
  do {
    const query = new URLSearchParams({
      user_ids: userId,
      statuses: "ACTIVE",
      limit: "100",
    });
    if (cursor) query.set("cursor", cursor);
    const page = await composioRequest<{
      items?: Array<{
        id: string;
        user_id?: string;
        status?: string;
        is_disabled?: boolean;
        auth_config?: { id?: string; is_disabled?: boolean };
        toolkit?: { slug?: string };
      }>;
      next_cursor?: string;
    }>(`/connected_accounts?${query}`, apiKey);
    for (const account of page.items ?? []) {
      const provider =
        account.toolkit?.slug?.toLowerCase() ||
        providers.get(account.auth_config?.id ?? "");
      if (
        !provider ||
        account.user_id !== userId ||
        account.status !== "ACTIVE" ||
        account.is_disabled ||
        account.auth_config?.is_disabled ||
        !account.id
      )
        continue;
      accounts.set(account.id, { id: account.id, provider });
    }
    cursor = page.next_cursor ?? "";
    if (cursor && cursors.has(cursor))
      throw new Error("Composio pagination did not advance.");
    cursors.add(cursor);
    if (cursors.size > 100)
      throw new Error("Composio account pagination limit reached.");
  } while (cursor);
  return [...accounts.values()];
}
