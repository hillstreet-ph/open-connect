/**
 * One place that turns a resolved gateway route into an actual completion.
 *
 * Why this exists
 * ---------------
 * A route's `baseUrl` is not always an HTTP endpoint. The credential-free
 * platform upstream (`cloudflare`) carries a *marker* base URL
 * (`https://workers-ai.cloudflare.com/v1`) because Workers AI inference runs
 * through the `OC_AI` binding, not over the network. Every caller that did a
 * bare `fetch(`${upstream.baseUrl}/chat/completions`)` therefore failed for
 * that upstream — which, on a deployment with no OpenRouter/LiteLLM key, is
 * the *only* upstream there is. That is the "fails at the provider step"
 * symptom: routing resolved, then the request went to a host that does not
 * serve chat completions.
 *
 * Callers must go through `requestRouteCompletion` so the binding path and the
 * HTTP path stay in one place.
 *
 * Server-only: never import from client code.
 */
/**
 * The upstream name is a plain string constant, duplicated here on purpose:
 * importing `cloudflare-ai.server.ts` statically would pull `cloudflare:workers`
 * into the client bundle (this module is reachable from route modules that the
 * client graph also loads). The binding itself is imported dynamically below.
 */
const CLOUDFLARE_AI_UPSTREAM_NAME = "cloudflare";

export type ChatRoute = {
  model: string;
  upstream: { name: string; baseUrl: string; headers: Record<string, string> };
};

export type ChatRequestBody = {
  messages: Array<Record<string, unknown>>;
  temperature?: number;
  max_tokens?: number;
  // `readonly` so callers can pass an `as const` tool list without copying it.
  tools?: readonly unknown[];
  tool_choice?: unknown;
  parallel_tool_calls?: boolean;
};

/** A failure that already knows the HTTP status it should surface as. */
export type StatusError = Error & { status: number };

export function statusError(message: string, status: number): StatusError {
  return Object.assign(new Error(message), { status });
}

export function carriesStatus(error: unknown): error is StatusError {
  return typeof (error as { status?: unknown })?.status === "number";
}

/**
 * Execute one chat completion against a resolved route.
 *
 * `cloudflare` → the Workers AI binding (no key, no HTTP).
 * anything else → the provider's OpenAI-compatible `/chat/completions`.
 *
 * Errors are always named: which upstream, which model, and why.
 */
export async function requestRouteCompletion(
  route: ChatRoute,
  body: ChatRequestBody,
  options: { timeoutMs?: number } = {},
): Promise<unknown> {
  const { upstream, model } = route;

  if (upstream.name === CLOUDFLARE_AI_UPSTREAM_NAME) {
    // Dynamic import keeps `cloudflare:workers` out of the client bundle.
    const { runCloudflareChatCompletion } = await import("./cloudflare-ai.server.ts");
    // The binding path cannot stream and takes a narrower body.
    return runCloudflareChatCompletion(model, {
      messages: body.messages,
      ...(body.temperature !== undefined ? { temperature: body.temperature } : {}),
      ...(body.max_tokens !== undefined ? { max_tokens: body.max_tokens } : {}),
    });
  }

  if (!upstream.baseUrl || !/^https:\/\//.test(upstream.baseUrl)) {
    throw statusError(
      `Upstream ${upstream.name} has no usable base URL. Set its provider key in AI Gateway.`,
      503,
    );
  }

  let response: Response;
  try {
    response = await fetch(`${upstream.baseUrl}/chat/completions`, {
      method: "POST",
      redirect: "manual",
      headers: upstream.headers,
      body: JSON.stringify({ ...body, model }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
    });
  } catch {
    throw statusError(
      `Upstream ${upstream.name} (model ${model}) timed out or failed before responding.`,
      504,
    );
  }

  const payload = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
  };

  if (!response.ok) {
    const detail = payload?.error?.message ?? `Upstream returned HTTP ${response.status}.`;
    // 401/403 means the credential is the problem, and the operator needs to
    // know which secret to fix rather than reading a generic upstream error.
    if (response.status === 401 || response.status === 403) {
      throw statusError(
        `Upstream ${upstream.name} rejected its saved credential (HTTP ${response.status}). Update the provider key in AI Gateway.`,
        response.status,
      );
    }
    throw statusError(
      `Upstream ${upstream.name} (model ${model}) returned HTTP ${response.status}: ${detail}`,
      response.status,
    );
  }

  return payload;
}
