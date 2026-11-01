import { modelForUpstream } from "@/lib/model-provider-state";
import { createFileRoute } from "@tanstack/react-router";
import { routeOpenAutoChat } from "@/lib/open-auto-router";
import {
  authenticateKey,
  gatewayError,
  hasScope,
  json,
  logGatewayRequest,
  isAutoFreeModel,
  resolveAutoFreeRoutes,
  resolveModelId,
  resolveUserUpstreams,
} from "@/lib/gateway.server";

/** Open-Auto pyramid routing: free-first tiered selection across upstreams. */
const OPEN_AUTO_MODEL_KEYS = new Set(["open-auto", "open-connect/open-auto"]);

export const Route = createFileRoute("/v1/chat/completions")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = await authenticateKey(request);
        if (!key) {
          return gatewayError("Missing or invalid Open-Connect key.", 401, "invalid_api_key");
        }
        if (!hasScope(key, "models:invoke")) {
          return gatewayError("Key is missing the models:invoke scope.", 403, "insufficient_scope");
        }

        const upstreams = await resolveUserUpstreams(key.userId);
        if (upstreams.length === 0) {
          return gatewayError("Model gateway is not configured.", 503, "upstream_unavailable");
        }

        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        if (!body || (body["model"] != null && typeof body["model"] !== "string")) {
          return gatewayError("The `model` field must be a string.", 400, "invalid_request");
        }

        const requestedModel =
          typeof body["model"] === "string" && body["model"].trim()
            ? (body["model"] as string).trim()
            : "open-connect/auto";
        const streaming = body["stream"] === true;

        // Open-Auto: free-first tiered routing with automatic rotation past
        // rate limits, timeouts, and server errors across connected upstreams.
        if (OPEN_AUTO_MODEL_KEYS.has(requestedModel)) {
          if (streaming) {
            return gatewayError(
              "Streaming is not supported for Open-Auto routed requests.",
              400,
              "invalid_request",
            );
          }
          const autoRoutes = await resolveAutoFreeRoutes(upstreams);
          if (autoRoutes.length === 0) {
            return gatewayError(
              "No free candidate models are available for Open-Auto routing.",
              503,
              "free_models_unavailable",
            );
          }
          const upstreamByModel = new Map(autoRoutes.map((route) => [route.model, route.upstream]));
          const autoTools = body["tools"] as unknown[] | undefined;
          const autoTemperature = body["temperature"] as number | undefined;
          const autoMaxTokens = body["max_tokens"] as number | undefined;
          const autoRequest = {
            messages: (body["messages"] as Array<Record<string, unknown>>) ?? [],
            ...(autoTools !== undefined ? { tools: autoTools } : {}),
            ...(autoTemperature !== undefined ? { temperature: autoTemperature } : {}),
            ...(autoMaxTokens !== undefined ? { max_tokens: autoMaxTokens } : {}),
          };
          try {
            const { model, result } = await routeOpenAutoChat({
              candidates: [...upstreamByModel.keys()].map((id) => ({ id })),
              request: autoRequest,
              chat: async (modelId) => {
                const upstream = upstreamByModel.get(modelId);
                if (!upstream) {
                  const unbound = new Error("No upstream bound for the selected model.");
                  throw Object.assign(unbound, { status: 400 });
                }
                const response = await fetch(`${upstream.baseUrl}/chat/completions`, {
                  method: "POST",
                  headers: upstream.headers,
                  redirect: "manual",
                  body: JSON.stringify({ ...body, model: modelId, stream: false }),
                  signal: AbortSignal.timeout(30_000),
                });
                const payload = await response.json().catch(() => ({}));
                if (!response.ok) {
                  const message =
                    (payload as { error?: { message?: string } })?.error?.message ??
                    `Upstream returned HTTP ${response.status}.`;
                  const failure = new Error(message);
                  throw Object.assign(failure, { status: response.status });
                }
                return payload;
              },
            });
            await logGatewayRequest({
              key,
              endpoint: "/v1/chat/completions",
              model,
              statusCode: 200,
              upstream: upstreamByModel.get(model)?.name ?? "open-auto",
              totalTokens:
                (result as { usage?: { total_tokens?: number } })?.usage?.total_tokens ?? null,
            });
            return json(result, 200);
          } catch (error) {
            const message = error instanceof Error ? error.message : "Open-Auto routing failed.";
            await logGatewayRequest({
              key,
              endpoint: "/v1/chat/completions",
              model: requestedModel,
              statusCode: 502,
              upstream: "open-auto",
            });
            return json(
              { error: { message, type: "open_connect_error", code: "open_auto_failed" } },
              502,
            );
          }
        }

        const autoFree = isAutoFreeModel(requestedModel);
        const routes = autoFree
          ? await resolveAutoFreeRoutes(upstreams)
          : upstreams.map((upstream) => ({
              upstream,
              model: modelForUpstream(resolveModelId(requestedModel), upstream.name),
            }));
        if (routes.length === 0) {
          return gatewayError(
            "No connected OpenRouter free router or zero-cost LiteLLM model is available.",
            503,
            "free_models_unavailable",
          );
        }

        let lastError: { status: number; body: unknown } | null = null;

        const deadline = Date.now() + 35_000;
        for (const route of routes) {
          if (autoFree && !streaming && Date.now() >= deadline) break;
          const { upstream, model } = route;
          try {
            const response = await fetch(`${upstream.baseUrl}/chat/completions`, {
              method: "POST",
              headers: upstream.headers,
              redirect: "manual",
              body: JSON.stringify({ ...body, model }),
              signal: AbortSignal.timeout(
                autoFree && !streaming
                  ? Math.max(1, Math.min(12_000, deadline - Date.now()))
                  : 120_000,
              ),
            });

            if (streaming) {
              if (!response.ok) {
                lastError = {
                  status: response.status,
                  body: await response.json().catch(() => ({})),
                };
                continue;
              }
              await logGatewayRequest({
                key,
                endpoint: "/v1/chat/completions",
                model: requestedModel,
                statusCode: response.status,
                upstream: upstream.name,
              });
              return new Response(response.body, {
                status: response.status,
                headers: {
                  "content-type": response.headers.get("content-type") ?? "text/event-stream",
                  "cache-control": "no-cache",
                  "x-open-connect-upstream": upstream.name,
                  "x-open-connect-model": model,
                },
              });
            }

            const result = (await response.json()) as {
              usage?: { total_tokens?: number };
              error?: unknown;
            };

            if (!response.ok) {
              lastError = { status: response.status, body: result };
              // try next upstream on 5xx / 404 model
              if (autoFree || response.status >= 500 || response.status === 404) continue;
              await logGatewayRequest({
                key,
                endpoint: "/v1/chat/completions",
                model: requestedModel,
                statusCode: response.status,
                upstream: upstream.name,
              });
              return json(result, response.status);
            }

            await logGatewayRequest({
              key,
              endpoint: "/v1/chat/completions",
              model: requestedModel,
              statusCode: response.status,
              upstream: upstream.name,
              totalTokens: result.usage?.total_tokens ?? null,
            });

            return json(result, response.status);
          } catch {
            lastError = { status: 502, body: { error: { message: "Upstream request failed" } } };
          }
        }

        await logGatewayRequest({
          key,
          endpoint: "/v1/chat/completions",
          model: requestedModel,
          statusCode: lastError?.status ?? 502,
          upstream: routes.map((route) => route.upstream.name).join("+"),
        });

        return json(
          lastError?.body ?? {
            error: {
              message: "All model upstreams failed",
              type: "open_connect_error",
              code: "upstream_failed",
            },
          },
          lastError?.status ?? 502,
        );
      },
    },
  },
});
