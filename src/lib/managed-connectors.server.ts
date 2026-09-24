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
