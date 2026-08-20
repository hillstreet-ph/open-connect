import { createFileRoute } from "@tanstack/react-router";
import {
  authenticateKey,
  gatewayError,
  hasScope,
  json,
  logGatewayRequest,
  resolveModelId,
  resolveUpstream,
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

        const upstream = resolveUpstream();
        if (!upstream) {
          return gatewayError("Model gateway is not configured.", 503, "upstream_unavailable");
        }

        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        if (!body || typeof body["model"] !== "string") {
          return gatewayError("A `model` field is required.", 400, "invalid_request");
        }

        const requestedModel = body["model"] as string;
        const resolvedModel = resolveModelId(requestedModel);
        const payload = { ...body, model: resolvedModel };

        const response = await fetch(`${upstream.baseUrl}/chat/completions`, {
          method: "POST",
          headers: upstream.headers,
          body: JSON.stringify(payload),
        });

        const streaming = body["stream"] === true;
        if (streaming) {
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
            },
          });
        }

        const result = (await response.json().catch(() => ({}))) as {
          usage?: { total_tokens?: number };
        };

        await logGatewayRequest({
          key,
          endpoint: "/v1/chat/completions",
          model: requestedModel,
          statusCode: response.status,
          upstream: upstream.name,
          totalTokens: result.usage?.total_tokens ?? null,
        });

        return json(result, response.status);
      },
    },
  },
});
