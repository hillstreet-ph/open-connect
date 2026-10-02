type AuthConfigMap = Record<string, string>;

function authConfigs(): AuthConfigMap {
  const raw = process.env["COMPOSIO_AUTH_CONFIGS"]?.trim();
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        ([provider, id]) => provider.length > 0 && typeof id === "string" && id.startsWith("ac_"),
      ),
    );
  } catch {
    return {};
  }
}

export function managedConnectorReady(provider: string): boolean {
  return Boolean(process.env["COMPOSIO_API_KEY"]?.trim() && authConfigs()[provider]);
}

function config(provider: string) {
  const apiKey = process.env["COMPOSIO_API_KEY"]?.trim();
  const authConfigId = authConfigs()[provider];
  if (!apiKey || !authConfigId) {
    throw new Error(
      `${provider} managed authorization is not configured. Add COMPOSIO_API_KEY and its auth config ID to COMPOSIO_AUTH_CONFIGS.`,
    );
  }
  return { apiKey, authConfigId };
}

async function composioRequest<T>(path: string, apiKey: string, init?: RequestInit): Promise<T> {
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
    throw new Error(payload.error?.message || `Connector broker failed (HTTP ${response.status}).`);
  }
  return payload as T;
}

export async function createManagedConnectionLink(input: {
  provider: string;
  userId: string;
  callbackUrl: string;
  alias?: string;
}) {
  const { apiKey, authConfigId } = config(input.provider);
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

export async function getManagedConnection(provider: string, connectedAccountId: string) {
  const { apiKey } = config(provider);
  return composioRequest<{
    id?: string;
    status?: string;
    toolkit?: { slug?: string };
  }>(`/connected_accounts/${encodeURIComponent(connectedAccountId)}`, apiKey);
}

export async function deleteManagedConnection(provider: string, connectedAccountId: string) {
  const { apiKey } = config(provider);
  await composioRequest<unknown>(
    `/connected_accounts/${encodeURIComponent(connectedAccountId)}`,
    apiKey,
    { method: "DELETE" },
  );
}

/** Prefer an explicitly configured broker, retaining native/key fallbacks. */
export function connectionMethod(provider: string, oauth: boolean, managedReady: boolean) {
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
  if (!Array.isArray(mapped) || mapped.some((id) => typeof id !== "string" || !id.trim())) {
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
  const providers = new Map(Object.entries(authConfigs()).map(([provider, id]) => [id, provider]));
  const aliases = JSON.parse(process.env["COMPOSIO_AUTH_CONFIG_ALIASES"] || "{}") as Record<
    string,
    string
  >;
  for (const [id, provider] of Object.entries(aliases)) {
    if (id.startsWith("ac_") && authConfigs()[provider]) providers.set(id, provider);
  }
  const accounts = new Map<string, { id: string; provider: string }>();
  const cursors = new Set<string>();
  let cursor = "";
  do {
    const query = new URLSearchParams({ user_ids: userId, statuses: "ACTIVE", limit: "100" });
    if (cursor) query.set("cursor", cursor);
    const page = await composioRequest<{
      items?: Array<{
        id: string;
        user_id?: string;
        status?: string;
        is_disabled?: boolean;
        auth_config?: { id?: string; is_disabled?: boolean };
      }>;
      next_cursor?: string;
    }>(`/connected_accounts?${query}`, apiKey);
    for (const account of page.items ?? []) {
      const provider = providers.get(account.auth_config?.id ?? "");
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
    if (cursor && cursors.has(cursor)) throw new Error("Composio pagination did not advance.");
    cursors.add(cursor);
    if (cursors.size > 100) throw new Error("Composio account pagination limit reached.");
  } while (cursor);
  return [...accounts.values()];
}
