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

const MANAGED_CATALOG = [
  ...Object.keys(MODEL_ALIASES),
  "google/gemini-2.5-flash",
  "openai/gpt-4o-mini",
  "openai/gpt-4o",
  "anthropic/claude-sonnet-4",
];

export const Route = createFileRoute("/v1/models")({
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
        if (!upstream) {
          return gatewayError("Model gateway is not configured.", 503, "upstream_unavailable");
        }

        const response = await fetch(`${upstream.baseUrl}/models`, { headers: upstream.headers });
        let payload: unknown = await response.json().catch(() => ({}));
        let status = response.status;

        if (!response.ok || upstream.name === "openrouter") {
          const upstreamData =
            payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data)
              ? ((payload as { data: { id: string }[] }).data ?? [])
              : [];
          const ids = new Set<string>([...MANAGED_CATALOG, ...upstreamData.map((m) => m.id)]);
          status = 200;
          payload = {
            object: "list",
            data: [...ids].map((id) => ({
              id,
              object: "model",
              owned_by: id.startsWith("open-connect/") ? "open-connect" : "upstream",
            })),
          };
        }

        await logGatewayRequest({
          key,
          endpoint: "/v1/models",
          statusCode: status,
          upstream: upstream.name,
        });

        return json(payload, status);
      },
    },
  },
});
