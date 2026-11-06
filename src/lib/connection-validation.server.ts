import { openApiOperations } from "./openapi-connector.ts";
import { normalizeAuthHeader } from "./connection-auth-header.ts";
import { AI_GATEWAY_PROVIDER_IDS, AI_GATEWAY_PROVIDERS } from "./ai-gateway-providers.ts";
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
  commandcode: "https://api.commandcode.ai/provider/v1",
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta",
  xai: "https://api.x.ai/v1",
  mistral: "https://api.mistral.ai/v1",
  deepseek: "https://api.deepseek.com/v1",
};

function publicHttpsTarget(raw: string | null | undefined): string | undefined {
  if (!raw || !raw.trim()) return undefined;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return undefined;
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const privateAddress =
    /^(?:0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(hostname) ||
    hostname === "::1" ||
    /^(?:fc|fd|fe8|fe9|fea|feb)/.test(hostname);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    hostname === "localhost" ||
    privateAddress ||
    hostname.endsWith(".local")
  ) {
    return undefined;
  }
  return url.toString().replace(/\/+$/, "");
}

function base(setup: Setup) {
  const official = AI_GATEWAY_PROVIDERS.find((provider) => provider.id === setup.provider);
  const legacyBase = ["commandcode", "cerebras"].includes(setup.provider)
    ? DEFAULT_BASES[setup.provider]
    : undefined;
  // Custom OpenAI-compatible deployments are validated against the saved endpoint.
  const custom = publicHttpsTarget(setup.endpointUrl);
  if (official && custom && custom !== official.baseUrl.replace(/\/+$/, "")) {
    return custom;
  }
  return (
    official?.baseUrl ||
    legacyBase ||
    setup.endpointUrl ||
    DEFAULT_BASES[setup.provider] ||
    ""
  ).replace(/\/+$/, "");
}

async function checkedFetch(
  url: string,
  init: RequestInit,
  send: typeof fetch,
  acceptedStatuses: readonly number[] = [],
): Promise<Response> {
  const response = await send(url, {
    ...init,
    cache: "no-store",
    redirect: "manual",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok && !acceptedStatuses.includes(response.status))
    throw new Error(`Provider validation failed (HTTP ${response.status}).`);
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

  if (setup.provider === "telegram") {
    if (!/^\d{1,20}:[A-Za-z0-9_-]{20,256}$/.test(setup.apiKey))
      throw new Error("Telegram requires a bot token in the format 123456:ABC-DEF…");
    const response = await checkedFetch(
      `https://api.telegram.org/bot${setup.apiKey}/getMe`,
      { headers: { Accept: "application/json" } },
      send,
    );
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      result?: { id?: number; username?: string };
    } | null;
    const identity = payload?.result;
    if (
      payload?.ok !== true ||
      !identity ||
      typeof identity.id !== "number" ||
      !Number.isSafeInteger(identity.id) ||
      identity.id <= 0
    )
      throw new Error("Telegram did not validate the bot token.");
    return {
      verified: true,
      accountId: identity.username ?? String(identity.id),
      detail: "Telegram bot verified with a read-only getMe request.",
    };
  }

  if (setup.provider === "e2b") {
    const response = await checkedFetch(
      "https://api.e2b.dev/sandboxes?limit=1",
      { headers: { "x-api-key": setup.apiKey, Accept: "application/json" } },
      send,
    );
    const payload: unknown = await response.json().catch(() => null);
    if (!Array.isArray(payload)) throw new Error("E2B did not return a valid sandbox list.");
    return {
      verified: true,
      detail: "E2B key verified with a read-only sandbox list request.",
    };
  }

  if (setup.provider === "hubstaff_admin") {
    const payload = (await (
      await checkedFetch(
        "https://api.hubstaff.com/v2/users/me",
        { headers: { ...bearer, Accept: "application/json" } },
        send,
      )
    )
      .json()
      .catch(() => null)) as { user?: { id?: number } } | null;
    if (!Number.isSafeInteger(payload?.user?.id) || payload!.user!.id! <= 0)
      throw new Error("Hubstaff did not validate the access token.");
    return {
      verified: true,
      accountId: String(payload!.user!.id),
      detail: "Hubstaff access verified with a read-only profile request.",
    };
  }

  if (setup.provider === "stripe") {
    const response = await checkedFetch(
      "https://api.stripe.com/v1/customers?limit=1",
      { headers: { ...bearer, Accept: "application/json" } },
      send,
      [403],
    );
    // Restricted keys may authorize other resources without Customer read access.
    // A permission denial cannot establish credential validity or tool access.
    if (response.status === 403)
      return {
        verified: false,
        detail:
          "Credential stored; Stripe Customer read access was denied. Connection remains unverified.",
      };
    const payload = (await response.json().catch(() => null)) as {
      object?: unknown;
      data?: unknown;
    } | null;
    if (payload?.object !== "list" || !Array.isArray(payload.data))
      throw new Error("Stripe did not return a valid customer list.");
    return {
      verified: true,
      detail: "Stripe key verified with a read-only customer list request.",
    };
  }

  if (setup.provider === "anthropic") {
    const response = await checkedFetch(
      `${base(setup)}/models`,
      { headers: { "x-api-key": setup.apiKey, "anthropic-version": "2023-06-01" } },
      send,
    );
    const payload = (await response.json().catch(() => null)) as { data?: unknown } | null;
    if (!Array.isArray(payload?.data))
      throw new Error("Provider did not return a valid model catalog.");
    return { verified: true, detail: `API key verified; ${payload.data.length} models fetched.` };
  }

  if (setup.provider === "google") {
    const response = await checkedFetch(
      `${DEFAULT_BASES["google"]}/models`,
      { headers: { "x-goog-api-key": setup.apiKey } },
      send,
    );
    const payload = (await response.json().catch(() => null)) as { models?: unknown } | null;
    if (!Array.isArray(payload?.models))
      throw new Error("Provider did not return a valid model catalog.");
    return { verified: true, detail: `API key verified; ${payload.models.length} models fetched.` };
  }

  // Cohere's compatibility API has no model-list contract. Its native endpoint
  // authenticates the same key and returns `models`, not OpenAI's `data`.
  // https://docs.cohere.com/v2/reference/list-models
  if (setup.provider === "cohere" && new URL(base(setup)).origin === "https://api.cohere.com") {
    const response = await checkedFetch(
      "https://api.cohere.com/v1/models",
      { headers: bearer },
      send,
    );
    const payload = (await response.json().catch(() => null)) as { models?: unknown } | null;
    if (!Array.isArray(payload?.models))
      throw new Error("Provider did not return a valid model catalog.");
    return { verified: true, detail: `API key verified; ${payload.models.length} models fetched.` };
  }

  // Novita's model catalog is public and can succeed with an invalid bearer key.
  // Do not spend inference or mislabel catalog discovery as credential validation.
  // A separately hosted compatible deployment retains its own catalog contract.
  if (setup.provider === "novita" && new URL(base(setup)).origin === "https://api.novita.ai")
    return {
      verified: false,
      detail:
        "Credential stored; Novita's public model catalog cannot verify API keys. Authenticated inference has not been tested.",
    };

  if (
    AI_GATEWAY_PROVIDER_IDS.has(setup.provider) ||
    ["litellm", "cerebras", "commandcode"].includes(setup.provider)
  ) {
    const providerBase = base(setup);
    if (!providerBase) throw new Error("Provider base URL is required for validation.");
    const response = await checkedFetch(`${providerBase}/models`, { headers: bearer }, send);
    const detail = catalogDetail(await response.json().catch(() => null));
    if (!detail)
      throw new Error("Provider did not return a valid model catalog. Check its API endpoint.");
    return { verified: true, detail };
  }

  // Best-effort validation for every remaining provider: a public HTTPS
  // endpoint is probed with a read-only model catalog request, so a stored
  // credential never silently stays unverified when the provider can answer.
  const genericBase = publicHttpsTarget(setup.endpointUrl);
  if (!genericBase) {
    return {
      verified: false,
      detail:
        "Credential stored; add the provider's public HTTPS API endpoint to enable automatic validation.",
    };
  }
  const genericHeaders =
    setup.authType === "api_key"
      ? { [normalizeAuthHeader(setup.authHeader)]: setup.apiKey }
      : bearer;
  try {
    const response = await checkedFetch(`${genericBase}/models`, { headers: genericHeaders }, send);
    const detail = catalogDetail(await response.json().catch(() => null));
    if (!detail)
      return {
        verified: false,
        detail:
          "Credential stored; the endpoint responded without a model catalog, so the key stays unverified.",
      };
    return { verified: true, detail };
  } catch (error) {
    const status = (error as Error).message.match(/HTTP (\d+)/)?.[1];
    if (status === "401" || status === "403") throw error;
    return {
      verified: false,
      detail:
        "Credential stored; the endpoint did not answer the validation request, so the key stays unverified.",
    };
  }
}

/** Read the model count out of an OpenAI-style or Gemini-style catalog response. */
function catalogDetail(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as { data?: unknown; models?: unknown };
  const catalog = Array.isArray(record.data)
    ? record.data
    : Array.isArray(record.models)
      ? record.models
      : null;
  return catalog ? `API key verified; ${catalog.length} models fetched.` : null;
}
