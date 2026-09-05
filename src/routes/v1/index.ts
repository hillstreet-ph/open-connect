import { createFileRoute } from "@tanstack/react-router";
import {
  authenticateKey,
  gatewayError,
  hasScope,
  json,
  logGatewayRequest,
  MODEL_ALIASES,
  resolveUpstream,
} from "@/lib/gateway.server";

/**
 * OpenAI-compatible root under /v1.
 * Clients that probe the base URL get a useful response instead of SPA 404.
 */
export const Route = createFileRoute("/v1/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const key = await authenticateKey(request);
        if (!key) {
          return gatewayError("Missing or invalid Open-Connect key.", 401, "invalid_api_key");
        }
        if (!hasScope(key, "models:read") && !hasScope(key, "models:invoke")) {
          return gatewayError("Key is missing the models:read scope.", 403, "insufficient_scope");
        }

        const upstream = resolveUpstream();

        await logGatewayRequest({
          key,
          endpoint: "/v1",
          statusCode: 200,
          upstream: upstream?.name ?? "none",
        });

        return json({
          object: "list",
          service: "open-connect",
          domain: "open-connect.site",
          endpoints: {
            models: "/v1/models",
            chat_completions: "/v1/chat/completions",
            mcp: "/mcp",
            api: "/api/v1",
            oauth: "/oauth",
          },
          aliases: Object.keys(MODEL_ALIASES),
          upstream: upstream?.name ?? null,
        });
      },
    },
  },
});