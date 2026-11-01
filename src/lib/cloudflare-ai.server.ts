/**
 * Cloudflare Workers AI — credential-free free-tier inference platform upstream.
 *
 * Binding: OC_AI (see wrangler.toml). Unlike OpenRouter/LiteLLM upstreams the
 * binding needs no API key, so Open-Auto free-first routing works on every
 * deployment without stored secrets.
 *
 * Server-only: never import from client code.
 */

/** Platform upstream name used by the gateway resolver and routing surfaces. */
export const CLOUDFLARE_AI_UPSTREAM_NAME = "cloudflare";

/** Marker base URL; actual inference goes through the binding, not HTTP. */
export const CLOUDFLARE_AI_BASE_URL = "https://workers-ai.cloudflare.com/v1";

/** Workers AI free-tier chat models used for Open-Auto free-first routing. */
export const CLOUDFLARE_AI_FREE_MODELS: string[] = [
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "@cf/meta/llama-3.1-8b-instruct-fp8-fast",
  "@cf/meta/llama-3.1-8b-instruct",
];

type AiBinding = {
  run: (model: string, input: Record<string, unknown>) => Promise<unknown>;
};

type CloudflareEnv = {
  OC_AI?: AiBinding;
};

async function getCloudflareEnv(): Promise<CloudflareEnv | null> {
  try {
    // Available in the Cloudflare Workers / Pages runtime with bindings.
    const mod = await import("cloudflare:workers");
    return (mod as { env?: CloudflareEnv }).env ?? null;
  } catch {
    return null;
  }
}

/** Returns the Workers AI binding, or null when unbound / off Cloudflare. */
export async function getCloudflareAi(): Promise<AiBinding | null> {
  const env = await getCloudflareEnv();
  const ai = env?.OC_AI;
  return ai && typeof ai.run === "function" ? ai : null;
}

export type CloudflareChatMessage = {
  role: unknown;
  content: unknown;
};

export type CloudflareChatRequest = {
  messages: CloudflareChatMessage[];
  temperature?: number;
  max_tokens?: number;
};

type WorkerAiChatPayload = {
  result?: { response?: unknown };
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
};

export type OpenAiChatCompletion = {
  id: string;
  object: "chat.completion";
  model: string;
  choices: Array<{
    index: number;
    message: { role: "assistant"; content: string };
    finish_reason: "stop";
  }>;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
};

function textContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  return JSON.stringify(value);
}

/** Map a Workers AI response into an OpenAI-compatible chat completion. */
export function toOpenAiChatCompletion(model: string, payload: unknown): OpenAiChatCompletion {
  const body = (payload ?? {}) as WorkerAiChatPayload;
  const promptTokens = typeof body.usage?.prompt_tokens === "number" ? body.usage.prompt_tokens : 0;
  const completionTokens =
    typeof body.usage?.completion_tokens === "number" ? body.usage.completion_tokens : 0;
  return {
    id: "cf-" + model.replace(/[^a-z0-9-]/gi, ""),
    object: "chat.completion",
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: textContent(body.result?.response) },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
  };
}

/** Run a chat completion through the Workers AI binding. */
export async function runCloudflareChatCompletion(
  model: string,
  request: CloudflareChatRequest,
): Promise<OpenAiChatCompletion> {
  const ai = await getCloudflareAi();
  if (!ai) {
    throw Object.assign(
      new Error("Cloudflare Workers AI binding is not configured on this deployment."),
      { status: 503 },
    );
  }
  try {
    const payload = await ai.run(model, {
      messages: request.messages.map((message) => ({
        role: typeof message.role === "string" ? message.role : "user",
        content: textContent(message.content),
      })),
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(request.max_tokens !== undefined ? { max_tokens: request.max_tokens } : {}),
    });
    return toOpenAiChatCompletion(model, payload);
  } catch (error) {
    if (typeof (error as { status?: unknown })?.status === "number") throw error;
    throw Object.assign(new Error("Cloudflare Workers AI model " + model + " failed to respond."), {
      status: 504,
    });
  }
}
