import { createFileRoute } from "@tanstack/react-router";
import {
  authenticateKey,
  gatewayError,
  hasScope,
  json,
  logGatewayRequest,
} from "@/lib/gateway.server";

async function listCatalogTools() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("resources")
    .select("slug, name, description, resource_type")
    .eq("published", true)
    .order("featured", { ascending: false })
    .limit(100);

  const tools = [
    {
      name: "open_connect_status",
      description: "Return Open-Connect gateway status for this key",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "list_resources",
      description: "List published Open-Connect resources (skills, MCP, tools, plugins, agents, prompts)",
      inputSchema: {
        type: "object",
        properties: {
          type: {
            type: "string",
            description: "Optional filter: skill | mcp | tool | plugin | agent | prompt | guide",
          },
        },
      },
    },
    ...(data ?? []).map((r) => ({
      name: `resource_${r.slug.replace(/[^a-z0-9_]/gi, "_").toLowerCase()}`,
      description: `[${r.resource_type}] ${r.name}${r.description ? ` — ${r.description}` : ""}`,
      inputSchema: {
        type: "object",
        properties: {
          action: { type: "string", description: "info | invoke" },
        },
      },
    })),
  ];

  return { tools, rows: data ?? [] };
}

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
        if (
          !hasScope(key, "mcp:connect") &&
          !hasScope(key, "models:read") &&
          !hasScope(key, "models:invoke") &&
          !hasScope(key, "resources:read")
        ) {
          return gatewayError("Key is missing mcp, models, or resources scope.", 403, "insufficient_scope");
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
          const { tools } = await listCatalogTools();
          result = { tools };
        } else if (body.method === "tools/call") {
          const name = (body.params as { name?: string; arguments?: Record<string, unknown> } | undefined)
            ?.name;
          const args =
            (body.params as { arguments?: Record<string, unknown> } | undefined)?.arguments ?? {};

          if (name === "open_connect_status") {
            result = {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    gateway: "open-connect.site",
                    scopes: key.scopes,
                    user_id: key.userId,
                  }),
                },
              ],
            };
          } else if (name === "list_resources") {
            const { rows } = await listCatalogTools();
            const typeFilter = typeof args.type === "string" ? args.type : null;
            const filtered = typeFilter
              ? rows.filter((r) => r.resource_type === typeFilter)
              : rows;
            result = {
              content: [{ type: "text", text: JSON.stringify({ data: filtered }, null, 2) }],
            };
          } else if (name?.startsWith("resource_")) {
            const slug = name.replace(/^resource_/, "").replace(/_/g, "-");
            const { rows } = await listCatalogTools();
            const match =
              rows.find((r) => r.slug === slug) ||
              rows.find((r) => r.slug.replace(/-/g, "_") === name.replace(/^resource_/, ""));
            result = {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    match
                      ? {
                          status: "available",
                          resource: match,
                          note: "Capability resolved via Open-Connect registry. Provider secrets stay server-side.",
                        }
                      : { status: "not_found", tool: name },
                    null,
                    2,
                  ),
                },
              ],
            };
          } else {
            result = {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ gateway: "open-connect.site", scopes: key.scopes, tool: name }),
                },
              ],
            };
          }
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
