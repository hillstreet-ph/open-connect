import { openApiOperations } from "./openapi-connector.ts";
import { normalizeAuthHeader } from "./connection-auth-header.ts";
import { AI_GATEWAY_PROVIDERS } from "./ai-gateway-providers.ts";
import type { normalizeConnectionSetup } from "./connection-setup";
import { isRemoteMcpProvider } from "./remote-mcp.ts";

type Setup = ReturnType<typeof normalizeConnectionSetup>;
type Validation = { verified: boolean; accountId?: string | undefined; detail: string };

const DEFAULT_BASES: Record<string, string> = {
  cloudflare: "https://api.cloudflare.com/client/v4",
  sentry: "https://sentry.io/api/0",
  zeabur: "https://api.zeabur.com",
  openrouter: "https://openrouter.ai/api/v1",
  nvidia: "https://integrate.api.nvidia.com/v1",
  ollama_cloud: "https://ollama.com/v1",
  groq: "https://api.groq.com/openai/v1",
  cerebras: "https://api.cerebras.ai/v1",
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta",
  xai: "https://api.x.ai/v1",
  mistral: "https://api.mistral.ai/v1",
  deepseek: "https://api.deepseek.com/v1",
};

function base(setup: Setup) {
  const official = AI_GATEWAY_PROVIDERS.find(
    (provider) => provider.id === setup.provider && provider.id !== "litellm",
  );
  return (official?.baseUrl || setup.endpointUrl || DEFAULT_BASES[setup.provider] || "").replace(
    /\/$/,
    "",
  );
}

async function checkedFetch(url: string, init: RequestInit, send: typeof fetch): Promise<Response> {
  const response = await send(url, {
    ...init,
    cache: "no-store",
    redirect: "manual",
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
  if (setup.provider === "custom_api" && setup.openapi) {
    const api = openApiOperations(setup.openapi);
    if (new URL(api.endpoint).origin !== new URL(setup.endpointUrl).origin)
      throw new Error("OpenAPI server origin must match the connection URL");
    return {
      verified: true,
      detail: `OpenAPI definition validated: ${api.tools.length} operations. No upstream operation has been executed.`,
    };
  }
  if (setup.provider === "custom_api")
    return {
      verified: false,
      detail:
        "API profile saved. Tool execution requires a reviewed provider adapter or MCP server; no API request was executed.",
    };
  if (isRemoteMcpProvider(setup.provider)) {
    const { withMcpClient } = await import("./mcp-client.server.ts");
    const headers =
      setup.authType === "none"
        ? {}
        : setup.authType === "api_key"
          ? { [normalizeAuthHeader(setup.authHeader)]: setup.apiKey }
          : bearer;
    const accountId = await withMcpClient(
      setup.endpointUrl,
      headers,
      async (client) => {
        const name = client.getServerVersion()?.name;
        if (!name) throw new Error("MCP initialization did not complete.");
        return name;
      },
      send,
      setup.transport === "sse" ? "sse" : "http",
    );
    return { verified: true, accountId, detail: "MCP initialized" };
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

  if (setup.provider === "browser_use" || setup.provider === "browserbase") {
    const use = setup.provider === "browser_use";
    const response = await checkedFetch(
      use
        ? "https://api.browser-use.com/api/v2/billing/account"
        : "https://api.browserbase.com/v1/projects",
      {
        headers: {
          [use ? "X-Browser-Use-API-Key" : "X-BB-API-Key"]: setup.apiKey,
          Accept: "application/json",
        },
      },
      send,
    );
    const payload: unknown = await response.json();
    if (
      use
        ? !payload || typeof payload !== "object" || !("projectId" in payload)
        : !Array.isArray(payload)
    )
      throw new Error("Browser provider did not return a valid account response.");
    return {
      verified: true,
      detail: "Browser provider key verified with a read-only account request. No browser started.",
    };
  }

  if (setup.provider === "tinyfish") {
    const payload = (await (
      await checkedFetch(
        "https://agent.tinyfish.ai/v1/profiles",
        { headers: { "X-API-Key": setup.apiKey, Accept: "application/json" } },
        send,
      )
    ).json()) as { profiles?: unknown[] };
    if (!Array.isArray(payload.profiles)) throw new Error("TinyFish did not validate the key.");
    return {
      verified: true,
      detail: `TinyFish key verified (${payload.profiles.length} browser profiles)`,
    };
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
      `${DEFAULT_BASES["google"]}/models`,
      { headers: { "x-goog-api-key": setup.apiKey } },
      send,
    );
    return { verified: true, detail: "Gemini models verified" };
  }

  if (
    [
      "openrouter",
      "openai",
      "xai",
      "mistral",
      "deepseek",
      "litellm",
      "nvidia",
      "ollama_cloud",
      "groq",
      "cerebras",
      "kilo",
      "commandcode",
      "huggingface",
    ].includes(setup.provider)
  ) {
    const providerBase = base(setup);
    if (!providerBase) throw new Error("Provider base URL is required for validation.");
    const response = await checkedFetch(`${providerBase}/models`, { headers: bearer }, send);
    const payload = (await response.json().catch(() => null)) as { data?: unknown } | null;
    if (!Array.isArray(payload?.data))
      throw new Error("Provider did not return a valid model catalog. Check its API endpoint.");
    return { verified: true, detail: "Provider models verified" };
  }

  return { verified: false, detail: "Credential stored; provider validation is not available yet" };
}
