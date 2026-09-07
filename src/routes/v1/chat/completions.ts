import { createFileRoute } from "@tanstack/react-router";
import {
  authenticateKey,
  gatewayError,
  hasScope,
  json,
  logGatewayRequest,
  resolveModelId,
  resolveUpstreams,
} from "@/lib/gateway.server";

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

        const upstreams = resolveUpstreams();
        if (upstreams.length === 0) {
          return gatewayError("Model gateway is not configured.", 503, "upstream_unavailable");
        }

        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        if (!body || typeof body["model"] !== "string") {
          return gatewayError("A `model` field is required.", 400, "invalid_request");
        }

        const requestedModel = body["model"] as string;
        const resolvedModel = resolveModelId(requestedModel);
        const payload = { ...body, model: resolvedModel };
        const streaming = body["stream"] === true;

        let lastError: { status: number; body: unknown } | null = null;

        for (const upstream of upstreams) {
          try {
            const response = await fetch(`${upstream.baseUrl}/chat/completions`, {
              method: "POST",
              headers: upstream.headers,
              body: JSON.stringify(payload),
              signal: AbortSignal.timeout(120_000),
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
                  "x-open-connect-model": resolvedModel,
                },
              });
            }

            const result = (await response.json().catch(() => ({}))) as {
              usage?: { total_tokens?: number };
              error?: unknown;
            };

            if (!response.ok) {
              lastError = { status: response.status, body: result };
              // try next upstream on 5xx / 404 model
              if (response.status >= 500 || response.status === 404) continue;
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
          upstream: upstreams.map((u) => u.name).join("+"),
        });

        return json(
          lastError?.body ?? {
            error: { message: "All model upstreams failed", type: "open_connect_error", code: "upstream_failed" },
          },
          lastError?.status ?? 502,
        );
      },
    },
  },
});
