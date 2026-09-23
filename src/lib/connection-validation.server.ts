import type { normalizeConnectionSetup } from "./connection-setup";

type Setup = ReturnType<typeof normalizeConnectionSetup>;
type Validation = { verified: boolean; accountId?: string; detail: string };

const DEFAULT_BASES: Record<string, string> = {
  cloudflare: "https://api.cloudflare.com/client/v4",
  sentry: "https://sentry.io/api/0",
  zeabur: "https://api.zeabur.com",
  openrouter: "https://openrouter.ai/api/v1",
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta",
  xai: "https://api.x.ai/v1",
  mistral: "https://api.mistral.ai/v1",
  deepseek: "https://api.deepseek.com/v1",
};

function base(setup: Setup) {
  return (setup.endpointUrl || DEFAULT_BASES[setup.provider] || "").replace(/\/$/, "");
}

async function checkedFetch(url: string, init: RequestInit, send: typeof fetch): Promise<Response> {
  const response = await send(url, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Provider validation failed (HTTP ${response.status}).`);
  return response;
}

export async function validateConnectionCredential(
  setup: Setup,
  send: typeof fetch = fetch,
): Promise<Validation> {
  const bearer = { Authorization: `Bearer ${setup.apiKey}` };
  if (setup.provider === "custom_mcp") {
    const response = await checkedFetch(
      setup.endpointUrl,
      {
        method: "POST",
        headers: {
          ...(setup.authType === "bearer" || setup.authType === "personal_access_token"
            ? bearer
            : setup.authType === "api_key"
              ? { "X-API-Key": setup.apiKey }
              : {}),
          Accept: "application/json, text/event-stream",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "open-connect-validator", version: "1.0.0" },
          },
        }),
      },
      send,
    );
    const payload = (await response.json()) as { result?: { serverInfo?: { name?: string } } };
    if (!payload.result?.serverInfo?.name) throw new Error("MCP initialization did not complete.");
    return { verified: true, accountId: payload.result.serverInfo.name, detail: "MCP initialized" };
  }

  if (setup.provider === "dockerhub") {
    const response = await checkedFetch(
      "https://hub.docker.com/v2/users/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: setup.accountLabel, password: setup.apiKey }),
      },
      send,
    );
    const payload = (await response.json()) as { token?: string };
    if (!payload.token) throw new Error("Docker Hub did not validate the credential.");
    return { verified: true, accountId: setup.accountLabel, detail: "Docker Hub login verified" };
  }

  if (setup.provider === "cloudflare") {
    const payload = (await (
      await checkedFetch(`${base(setup)}/user/tokens/verify`, { headers: bearer }, send)
    ).json()) as { success?: boolean; result?: { id?: string } };
    if (!payload.success) throw new Error("Cloudflare token verification failed.");
    return { verified: true, accountId: payload.result?.id, detail: "Cloudflare token verified" };
  }

  if (setup.provider === "supabase") {
    if (!setup.endpointUrl) throw new Error("Supabase project URL is required for validation.");
    await checkedFetch(
      `${base(setup)}/rest/v1/`,
      { headers: { apikey: setup.apiKey, Authorization: `Bearer ${setup.apiKey}` } },
      send,
    );
    return { verified: true, detail: "Supabase REST endpoint verified" };
  }

  if (setup.provider === "databricks") {
    if (!setup.endpointUrl) throw new Error("Databricks workspace URL is required for validation.");
    await checkedFetch(`${base(setup)}/api/2.0/workspace/list?path=/`, { headers: bearer }, send);
    return { verified: true, detail: "Databricks workspace verified" };
  }

  if (setup.provider === "sentry") {
    await checkedFetch(`${base(setup)}/organizations/`, { headers: bearer }, send);
    return { verified: true, detail: "Sentry organization access verified" };
  }

  if (setup.provider === "zeabur") {
    const response = await checkedFetch(
      `${base(setup)}/graphql`,
      {
        method: "POST",
        headers: { ...bearer, "Content-Type": "application/json" },
        body: JSON.stringify({ query: "query OpenConnectIdentity { me { _id username } }" }),
      },
      send,
    );
    const payload = (await response.json()) as {
      data?: { me?: { _id?: string } };
      errors?: unknown[];
    };
    if (payload.errors?.length || !payload.data?.me)
      throw new Error("Zeabur identity validation failed.");
    return { verified: true, accountId: payload.data.me._id, detail: "Zeabur identity verified" };
  }

  if (setup.provider === "anthropic") {
    await checkedFetch(
      `${base(setup)}/models`,
      { headers: { "x-api-key": setup.apiKey, "anthropic-version": "2023-06-01" } },
      send,
    );
    return { verified: true, detail: "Anthropic models verified" };
  }

  if (setup.provider === "google") {
    await checkedFetch(
      `${base(setup)}/models`,
      { headers: { "x-goog-api-key": setup.apiKey } },
      send,
    );
    return { verified: true, detail: "Gemini models verified" };
  }

  if (["openrouter", "openai", "xai", "mistral", "deepseek", "litellm"].includes(setup.provider)) {
    const providerBase = base(setup);
    if (!providerBase) throw new Error("Provider base URL is required for validation.");
    await checkedFetch(`${providerBase}/models`, { headers: bearer }, send);
    return { verified: true, detail: "Provider models verified" };
  }

  return { verified: false, detail: "Credential stored; provider validation is not available yet" };
}
