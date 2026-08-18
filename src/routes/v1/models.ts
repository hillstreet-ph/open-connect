import { createFileRoute } from "@tanstack/react-router";
import {
  authenticateKey,
  gatewayError,
  json,
  logGatewayRequest,
  resolveUpstream,
} from "@/lib/gateway.server";

// Stable Open-Connect aliases exposed when the managed model upstream does not
// publish its own catalog endpoint.
const MANAGED_CATALOG = [
  "google/gemini-3.7-flash",
  "google/gemini-3.5-flash",
  "google/gemini-3.1-pro-preview",
  "google/gemini-2.5-pro",
  "google/gemini-2.5-flash",
  "openai/gpt-5",
];

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
        let payload: unknown = await response.json().catch(() => ({}));
        let status = response.status;

        if (!response.ok) {
          if (upstream.name === "lovable-ai") {
            status = 200;
            payload = {
              object: "list",
              data: MANAGED_CATALOG.map((id) => ({
                id,
                object: "model",
                owned_by: "open-connect",
              })),
            };
          } else {
            await logGatewayRequest({
              key,
              endpoint: "/v1/models",
              statusCode: response.status,
              upstream: upstream.name,
            });
            return json(payload, response.status);
          }
        }

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
