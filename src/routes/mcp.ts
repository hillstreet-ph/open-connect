import { createFileRoute } from "@tanstack/react-router";
import {
  authenticateKey,
  gatewayError,
  hasScope,
  json,
  logGatewayRequest,
  type AuthedKey,
} from "@/lib/gateway.server";

const WWW_AUTH =
  'Bearer realm="open-connect", resource_metadata="https://open-connect.site/.well-known/oauth-protected-resource"';

const CATALOG_TTL_MS = 45_000;
const MODEL_ALIASES = [
  { id: "open-connect/fast", upstream: "openai/gpt-4o-mini" },
  { id: "open-connect/balanced", upstream: "openai/gpt-4o-mini" },
  { id: "open-connect/reasoning", upstream: "openai/gpt-4o" },
  { id: "open-connect/coding", upstream: "openai/gpt-4o" },
  { id: "open-connect/vision", upstream: "openai/gpt-4o" },
] as const;

type ResourceRow = {
  slug: string;
  name: string;
  description: string | null;
  resource_type: string;
  installation_type: string | null;
};

type McpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

/** Isolate-level cache (Cloudflare warm isolates reuse this). */
let catalogCache: {
  at: number;
  tools: McpTool[];
  bySlug: Map<string, ResourceRow>;
  byToolName: Map<string, ResourceRow>;
  count: number;
} | null = null;

const PLATFORM_TOOLS: McpTool[] = [
  {
    name: "open_connect_status",
    description: "Gateway status: resources, connections, models",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_resources",
    description: "List published resources (skills, MCP, tools, plugins, agents, prompts)",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description: "Filter: skill | mcp | tool | plugin | agent | prompt | guide",
        },
      },
    },
  },
  {
    name: "list_connections",
    description: "List connected apps (capability grants only)",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_models",
    description: "List open-connect model aliases on /v1",
    inputSchema: { type: "object", properties: {} },
  },
];

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

/** Compact JSON (no pretty-print) — smaller responses, faster serialize. */
function textResult(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
  };
}

function toolNameFromSlug(slug: string) {
  return `resource_${slug.replace(/[^a-z0-9_]/gi, "_").toLowerCase()}`;
}

async function getCatalog(force = false) {
  const now = Date.now();
  if (!force && catalogCache && now - catalogCache.at < CATALOG_TTL_MS) {
    return catalogCache;
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("resources")
    .select("slug, name, description, resource_type, installation_type")
    .eq("published", true)
    .order("featured", { ascending: false })
    .limit(100);

  const rows = (data ?? []) as ResourceRow[];
  const bySlug = new Map<string, ResourceRow>();
  const byToolName = new Map<string, ResourceRow>();
  const resourceTools: McpTool[] = [];

  for (const r of rows) {
    bySlug.set(r.slug, r);
    const tn = toolNameFromSlug(r.slug);
    byToolName.set(tn, r);
    resourceTools.push({
      name: tn,
      description: `[${r.resource_type}] ${r.name}${r.description ? ` — ${r.description.slice(0, 160)}` : ""}`,
      inputSchema: {
        type: "object",
        properties: {
          action: { type: "string", description: "info | invoke" },
        },
      },
    });
  }

  catalogCache = {
    at: now,
    tools: [...PLATFORM_TOOLS, ...resourceTools],
    bySlug,
    byToolName,
    count: rows.length,
  };
  return catalogCache;
}

async function findResourceByToolName(toolName: string): Promise<ResourceRow | null> {
  const catalog = await getCatalog();
  const hit = catalog.byToolName.get(toolName);
  if (hit) return hit;

  // Fallback: direct DB by normalized slug (cache miss / race)
  const raw = toolName.replace(/^resource_/, "");
  const slugHyphen = raw.replace(/_/g, "-");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("resources")
    .select("slug, name, description, resource_type, installation_type")
    .eq("published", true)
    .or(`slug.eq.${slugHyphen},slug.eq.${raw}`)
    .limit(1)
    .maybeSingle();
  return (data as ResourceRow | null) ?? null;
}

function fireLog(key: AuthedKey, statusCode: number) {
  void logGatewayRequest({
    key,
    endpoint: "/mcp",
    statusCode,
    upstream: "open-connect",
  });
}

export const Route = createFileRoute("/mcp")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const key = await authenticateKey(request);
        if (!key) return unauthorized("Missing or invalid Open-Connect key.");
        return json({
          name: "open-connect",
          version: "1.0.1",
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
          params?: { name?: string; arguments?: Record<string, unknown> };
        } | null;

        if (!body?.method) {
          return gatewayError("JSON-RPC method required.", 400, "invalid_request");
        }

        let result: unknown = { ok: true };

        if (body.method === "initialize") {
          result = {
            protocolVersion: "2025-06-18",
            capabilities: { tools: {} },
            serverInfo: {
              name: "open-connect",
              version: "1.0.1",
              planes: ["resources", "connections", "models"],
            },
          };
        } else if (body.method === "tools/list") {
          const catalog = await getCatalog();
          result = { tools: catalog.tools };
        } else if (body.method === "tools/call") {
          const name = body.params?.name;
          const args = body.params?.arguments ?? {};

          if (name === "open_connect_status") {
            const catalog = await getCatalog();
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { count: connections } = await supabaseAdmin
              .from("app_connections")
              .select("id", { count: "exact", head: true })
              .eq("user_id", key.userId)
              .eq("status", "connected");
            result = textResult({
              gateway: "open-connect.site",
              planes: {
                resources: { published: catalog.count },
                connections: { connected: connections ?? 0 },
                models: {
                  endpoint: "https://open-connect.site/v1",
                  aliases: MODEL_ALIASES.map((a) => a.id),
                },
              },
              scopes: key.scopes,
              user_id: key.userId,
            });
          } else if (name === "list_resources") {
            const catalog = await getCatalog();
            const typeFilter = typeof args['type'] === "string" ? args['type'] : null;
            const data = [...catalog.bySlug.values()]
              .filter((r) => !typeFilter || r.resource_type === typeFilter)
              .map((r) => ({
                slug: r.slug,
                name: r.name,
                type: r.resource_type,
                description: r.description,
              }));
            result = textResult({ data, count: data.length });
          } else if (name === "list_connections") {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { data: conns } = await supabaseAdmin
              .from("app_connections")
              .select("provider, display_name, status, scopes")
              .eq("user_id", key.userId)
              .eq("status", "connected")
              .order("created_at", { ascending: false })
              .limit(50);
            result = textResult({
              data: conns ?? [],
              note: "Capability grants only",
            });
          } else if (name === "list_models") {
            result = textResult({
              endpoint: "https://open-connect.site/v1",
              aliases: MODEL_ALIASES,
              auth: "Bearer oc_live_…",
            });
          } else if (name?.startsWith("resource_")) {
            const match = await findResourceByToolName(name);
            const action = typeof args['action'] === "string" ? args['action'] : "info";

            if (!match) {
              result = textResult({ status: "not_found", tool: name });
            } else if (action === "invoke") {
              const providerGuess = match.slug.split("-")[0]?.toLowerCase() ?? "";
              const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
              const { data: conn } = await supabaseAdmin
                .from("app_connections")
                .select("provider, display_name, status, scopes")
                .eq("user_id", key.userId)
                .eq("status", "connected")
                .ilike("provider", `%${providerGuess}%`)
                .limit(1)
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
                    ? `Capability grant for ${conn.display_name} is active.`
                    : "No matching app connection. Connect at /connections then re-invoke.",
                  next: conn ? null : "https://open-connect.site/connections",
                },
              });
            } else {
              result = textResult({
                status: "available",
                resource: match,
                note: "Use action=invoke to resolve Connections plane.",
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

        fireLog(key, 200);
        return json({ jsonrpc: "2.0", id: body.id ?? null, result });
      },
    },
  },
});
