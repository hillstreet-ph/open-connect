import { createFileRoute } from "@tanstack/react-router";
import {
  authenticateKey,
  gatewayError,
  hasScope,
  json,
  logGatewayRequest,
} from "@/lib/gateway.server";

const WWW_AUTH =
  'Bearer realm="open-connect", resource_metadata="https://open-connect.site/.well-known/oauth-protected-resource"';

function unauthorized(message: string) {
  return new Response(
    JSON.stringify({
      error: { message, type: "open_connect_error", code: "invalid_api_key" },
    }),
    {
      status: 401,
      headers: {
        "content-type": "application/json",
        "www-authenticate": WWW_AUTH,
        "access-control-allow-origin": "*",
      },
    },
  );
}

function textResult(payload: unknown) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

async function listCatalogTools() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("resources")
    .select("id, slug, name, description, resource_type, installation_type, installation_config, source_url, repository_url")
    .eq("published", true)
    .order("featured", { ascending: false })
    .limit(100);

  const tools = [
    {
      name: "open_connect_status",
      description: "Return Open-Connect gateway status for this key (resources + connections + models)",
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
    {
      name: "list_connections",
      description: "List the authenticated user's connected apps (capability grants, never secrets)",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "list_models",
      description: "List open-connect model aliases available on /v1",
      inputSchema: { type: "object", properties: {} },
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
        if (!key) return unauthorized("Missing or invalid Open-Connect key.");
        return json({
          name: "open-connect",
          version: "1.0.0",
          protocol: "mcp",
          planes: ["resources", "connections", "models"],
          endpoints: {
            mcp: "https://open-connect.site/mcp",
            models: "https://open-connect.site/v1",
            api: "https://open-connect.site/api/v1",
            oauth: "https://open-connect.site/.well-known/oauth-authorization-server",
          },
          authenticated: true,
          user_id: key.userId,
          scopes: key.scopes,
        });
      },
      POST: async ({ request }) => {
        const key = await authenticateKey(request);
        if (!key) return unauthorized("Missing or invalid Open-Connect key.");
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

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let result: unknown = { ok: true };

        if (body.method === "initialize") {
          result = {
            protocolVersion: "2025-06-18",
            capabilities: { tools: {} },
            serverInfo: {
              name: "open-connect",
              version: "1.0.0",
              planes: ["resources", "connections", "models"],
            },
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
            const [{ count: resources }, { count: connections }] = await Promise.all([
              supabaseAdmin
                .from("resources")
                .select("id", { count: "exact", head: true })
                .eq("published", true),
              supabaseAdmin
                .from("app_connections")
                .select("id", { count: "exact", head: true })
                .eq("user_id", key.userId)
                .eq("status", "connected"),
            ]);
            result = textResult({
              gateway: "open-connect.site",
              planes: {
                resources: { published: resources ?? 0 },
                connections: { connected: connections ?? 0 },
                models: {
                  endpoint: "https://open-connect.site/v1",
                  aliases: [
                    "open-connect/fast",
                    "open-connect/balanced",
                    "open-connect/reasoning",
                    "open-connect/coding",
                    "open-connect/vision",
                  ],
                },
              },
              scopes: key.scopes,
              user_id: key.userId,
            });
          } else if (name === "list_resources") {
            const { rows } = await listCatalogTools();
            const typeFilter = typeof args.type === "string" ? args.type : null;
            const filtered = typeFilter
              ? rows.filter((r) => r.resource_type === typeFilter)
              : rows;
            result = textResult({
              data: filtered.map((r) => ({
                slug: r.slug,
                name: r.name,
                type: r.resource_type,
                description: r.description,
              })),
              count: filtered.length,
            });
          } else if (name === "list_connections") {
            const { data: conns } = await supabaseAdmin
              .from("app_connections")
              .select("provider, display_name, status, scopes, last_used_at")
              .eq("user_id", key.userId)
              .order("created_at", { ascending: false });
            result = textResult({
              data: conns ?? [],
              note: "Capability grants only — provider secrets never leave the server.",
            });
          } else if (name === "list_models") {
            result = textResult({
              endpoint: "https://open-connect.site/v1",
              aliases: [
                { id: "open-connect/fast", upstream: "openai/gpt-4o-mini" },
                { id: "open-connect/balanced", upstream: "openai/gpt-4o-mini" },
                { id: "open-connect/reasoning", upstream: "openai/gpt-4o" },
                { id: "open-connect/coding", upstream: "openai/gpt-4o" },
                { id: "open-connect/vision", upstream: "openai/gpt-4o" },
              ],
              auth: "Authorization: Bearer oc_live_…",
            });
          } else if (name?.startsWith("resource_")) {
            const { rows } = await listCatalogTools();
            const raw = name.replace(/^resource_/, "");
            const match =
              rows.find((r) => r.slug === raw.replace(/_/g, "-")) ||
              rows.find((r) => r.slug.replace(/-/g, "_") === raw) ||
              rows.find((r) => r.slug.replace(/[^a-z0-9]/gi, "_").toLowerCase() === raw.toLowerCase());

            const action = typeof args.action === "string" ? args.action : "info";

            if (!match) {
              result = textResult({ status: "not_found", tool: name });
            } else if (action === "invoke") {
              // Resolve related connection capability if provider-named resource
              const providerGuess = match.slug.split("-")[0]?.toLowerCase();
              const { data: conn } = await supabaseAdmin
                .from("app_connections")
                .select("provider, display_name, status, scopes")
                .eq("user_id", key.userId)
                .eq("status", "connected")
                .ilike("provider", `%${providerGuess}%`)
                .maybeSingle();

              result = textResult({
                status: "invoked",
                resource: {
                  slug: match.slug,
                  name: match.name,
                  type: match.resource_type,
                  installation_type: match.installation_type,
                },
                connection: conn
                  ? {
                      provider: conn.provider,
                      display_name: conn.display_name,
                      status: conn.status,
                      scopes: conn.scopes,
                      mode: "capability_grant",
                    }
                  : null,
                execution: {
                  mode: conn ? "connection_backed" : "registry_only",
                  message: conn
                    ? `Capability grant for ${conn.display_name} is active. Provider credentials stay server-side.`
                    : "No matching app connection. Connect the app under /connections, then re-invoke.",
                  next: conn
                    ? null
                    : "https://open-connect.site/connections",
                },
              });
            } else {
              result = textResult({
                status: "available",
                resource: match,
                note: "Use action=invoke to resolve against your Connections plane.",
              });
            }
          } else {
            result = textResult({ gateway: "open-connect.site", scopes: key.scopes, tool: name });
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
