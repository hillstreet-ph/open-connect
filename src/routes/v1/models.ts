import { createFileRoute } from "@tanstack/react-router";
import {
  authenticateKey,
  fetchMergedModelCatalog,
  gatewayError,
  hasScope,
  json,
  logGatewayRequest,
  resolveUserUpstreams,
} from "@/lib/gateway.server";

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

        const configured = await resolveUserUpstreams(key.userId);
        const primary = configured[0];
        if (!primary) {
          return gatewayError("Model gateway is not configured.", 503, "upstream_unavailable");
        }

        const { ids, upstreams, providers } = await fetchMergedModelCatalog(configured);

        const payload = {
          object: "list",
          data: ids.map((id) => ({
            id,
            object: "model",
            owned_by: id.startsWith("open-connect/")
              ? "open-connect"
              : id.includes("/")
                ? id.split("/")[0]
                : "upstream",
          })),
          upstreams,
          providers,
          count: ids.length,
        };

        await logGatewayRequest({
          key,
          endpoint: "/v1/models",
          statusCode: 200,
          upstream: upstreams.join("+") || primary.name,
        });

        return json(payload, 200);
      },
    },
  },
});
