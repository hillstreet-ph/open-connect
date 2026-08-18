import { createFileRoute } from "@tanstack/react-router";
import {
  authenticateKey,
  gatewayError,
  json,
  logGatewayRequest,
  resolveUpstream,
} from "@/lib/gateway.server";

export const Route = createFileRoute("/v1/models")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const key = await authenticateKey(request);
        if (!key) {
          return gatewayError("Missing or invalid Open-Connect key.", 401, "invalid_api_key");
        }
        if (!key.scopes.includes("models:read")) {
          return gatewayError("Key is missing the models:read scope.", 403, "insufficient_scope");
        }

        const upstream = resolveUpstream();
        if (!upstream) {
          return gatewayError("Model gateway is not configured.", 503, "upstream_unavailable");
        }

        const response = await fetch(`${upstream.baseUrl}/models`, { headers: upstream.headers });
        const payload = await response.json().catch(() => ({}));

        await logGatewayRequest({
          key,
          endpoint: "/v1/models",
          statusCode: response.status,
          upstream: upstream.name,
        });

        return json(payload, response.status);
      },
    },
  },
});
