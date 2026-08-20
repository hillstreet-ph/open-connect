import { createFileRoute } from "@tanstack/react-router";
import {
  authenticateKey,
  gatewayError,
  hasScope,
  json,
  logGatewayRequest,
} from "@/lib/gateway.server";

export const Route = createFileRoute("/mcp")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const key = await authenticateKey(request);
        if (!key) return gatewayError("Missing or invalid Open-Connect key.", 401, "invalid_api_key");
        return json({
          name: "open-connect",
          version: "1.0.0",
          protocol: "mcp",
          endpoints: {
            mcp: "https://open-connect.site/mcp",
            models: "https://open-connect.site/v1",
            api: "https://open-connect.site/api/v1",
          },
          authenticated: true,
          user_id: key.userId,
          scopes: key.scopes,
        });
      },
      POST: async ({ request }) => {
        const key = await authenticateKey(request);
        if (!key) return gatewayError("Missing or invalid Open-Connect key.", 401, "invalid_api_key");
        if (!hasScope(key, "mcp:connect") && !hasScope(key, "models:read") && !hasScope(key, "models:invoke")) {
          return gatewayError("Key is missing mcp or models scope.", 403, "insufficient_scope");
        }
        const body = (await request.json().catch(() => null)) as {
          jsonrpc?: string;
          id?: string | number;
          method?: string;
          params?: Record<string, unknown>;
        } | null;
        if (!body?.method) {
          return gatewayError("JSON-RPC method required.", 400, "invalid_request");
        }
        let result: unknown = { ok: true };
        if (body.method === "initialize") {
          result = {
            protocolVersion: "2025-06-18",
            capabilities: { tools: {} },
            serverInfo: { name: "open-connect", version: "1.0.0" },
          };
        } else if (body.method === "tools/list") {
          result = {
            tools: [
              {
                name: "open_connect_status",
                description: "Return Open-Connect gateway status for this key",
                inputSchema: { type: "object", properties: {} },
              },
            ],
          };
        } else if (body.method === "tools/call") {
          const name = (body.params as { name?: string } | undefined)?.name;
          result = {
            content: [
              {
                type: "text",
                text: JSON.stringify({ gateway: "open-connect.site", scopes: key.scopes, tool: name }),
              },
            ],
          };
        } else if (body.method === "ping") {
          result = {};
        } else {
          result = { error: `Method not implemented: ${body.method}` };
        }
        await logGatewayRequest({
          key,
          endpoint: "/mcp",
          statusCode: 200,
          upstream: "open-connect",
        });
        return json({ jsonrpc: "2.0", id: body.id ?? null, result });
      },
    },
  },
});