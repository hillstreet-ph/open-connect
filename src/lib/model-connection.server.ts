/** Build an OpenRouter upstream only from the authenticated user's connection. */
export type SavedModelConnection = {
  provider: string;
  status: string;
  credential_reference: string | null;
  metadata?: unknown;
};

export type SavedModelUpstream = {
  name:
    | "openrouter"
    | "litellm"
    | "nvidia"
    | "ollama_cloud"
    | "groq"
    | "cerebras"
    | "openai"
    | "xai"
    | "mistral"
    | "deepseek";
  baseUrl: string;
  headers: Record<string, string>;
};

function credentialValue(raw: string): string {
  try {
    const payload = JSON.parse(raw) as { credential?: unknown };
    if (typeof payload.credential === "string" && payload.credential.trim()) {
      return payload.credential;
    }
  } catch {
    if (raw.trim()) return raw;
  }
  throw new Error("Model provider credential is invalid.");
}

function endpointForLiteLlm(metadata: unknown): string {
  const endpoint =
    metadata && typeof metadata === "object"
      ? (metadata as Record<string, unknown>)["endpoint_url"]
      : null;
  if (typeof endpoint !== "string" || !endpoint.trim()) {
    throw new Error("Reconnect LiteLLM with its HTTPS API endpoint.");
  }
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error("LiteLLM endpoint is invalid.");
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
    url.search ||
    url.hash ||
    hostname === "localhost" ||
    privateAddress ||
    hostname.endsWith(".local")
  ) {
    throw new Error("LiteLLM endpoint must be a public HTTPS URL.");
  }
  return url.toString().replace(/\/+$/, "");
}

const COMPATIBLE_MODEL_ENDPOINTS: Record<Exclude<SavedModelUpstream["name"], "litellm">, string> = {
  openrouter: "https://openrouter.ai/api/v1",
  nvidia: "https://integrate.api.nvidia.com/v1",
  ollama_cloud: "https://ollama.com/v1",
  groq: "https://api.groq.com/openai/v1",
  cerebras: "https://api.cerebras.ai/v1",
  openai: "https://api.openai.com/v1",
  xai: "https://api.x.ai/v1",
  mistral: "https://api.mistral.ai/v1",
  deepseek: "https://api.deepseek.com/v1",
};

/** Resolve connected OpenAI-compatible model providers for this user only. */
export async function savedModelUpstreams(
  userId: string,
  dependencies: {
    find: (userId: string) => Promise<SavedModelConnection[]>;
    resolve: (userId: string, credentialId: string) => Promise<string>;
  },
): Promise<SavedModelUpstream[]> {
  if (!userId) throw new Error("Authenticated model user required.");
  const connections = await dependencies.find(userId);
  const configured: SavedModelUpstream[] = [];
  for (const connection of connections) {
    if (
      !(connection.provider in COMPATIBLE_MODEL_ENDPOINTS || connection.provider === "litellm") ||
      connection.status !== "connected"
    ) {
      continue;
    }
    const reference = connection.credential_reference?.match(
      new RegExp(`^credential://${connection.provider}/([0-9a-f-]{36})$`, "i"),
    );
    // Old/imported connections can show as connected without a gateway vault reference.
    // Skip those rows so one stale connection cannot block another valid provider.
    if (!reference) continue;
    const credential = credentialValue(await dependencies.resolve(userId, reference[1]!));
    configured.push({
      name: connection.provider as SavedModelUpstream["name"],
      baseUrl:
        connection.provider === "litellm"
          ? endpointForLiteLlm(connection.metadata)
          : COMPATIBLE_MODEL_ENDPOINTS[
              connection.provider as Exclude<SavedModelUpstream["name"], "litellm">
            ],
      headers: {
        Authorization: `Bearer ${credential}`,
        "Content-Type": "application/json",
        ...(connection.provider === "openrouter" ? { "X-Title": "Open-Connect" } : {}),
      },
    });
  }
  return configured;
}

export async function savedOpenRouter(
  userId: string,
  dependencies: {
    find: (
      userId: string,
    ) => Promise<{ status: string; credential_reference: string | null } | null>;
    resolve: (userId: string, credentialId: string) => Promise<string>;
  },
) {
  if (!userId) throw new Error("Authenticated model user required.");
  const connection = await dependencies.find(userId);
  if (!connection) return null;
  if (connection.status !== "connected")
    throw new Error("Verify your OpenRouter connection first.");
  const match = connection.credential_reference?.match(
    /^credential:\/\/openrouter\/([0-9a-f-]{36})$/i,
  );
  if (!match) throw new Error("Reconnect OpenRouter to restore its credential reference.");
  const raw = await dependencies.resolve(userId, match[1]!);
  let credential = raw;
  try {
    const payload = JSON.parse(raw) as { credential?: unknown };
    if (typeof payload.credential !== "string") throw new Error("Invalid credential");
    credential = payload.credential;
  } catch {
    if (!raw.startsWith("sk-or-")) throw new Error("OpenRouter credential is invalid.");
  }
  if (!credential.trim()) throw new Error("OpenRouter credential is empty.");
  return {
    name: "openrouter" as const,
    baseUrl: "https://openrouter.ai/api/v1",
    headers: {
      Authorization: `Bearer ${credential}`,
      "Content-Type": "application/json",
      "X-Title": "Open-Connect",
    },
  };
}
