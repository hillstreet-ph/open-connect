import { createFileRoute } from "@tanstack/react-router";
import {
  authenticateKey,
  gatewayError,
  hasScope,
  json,
  logGatewayRequest,
  type AuthedKey,
} from "@/lib/gateway.server";
import {
  buildAdaptivePlan,
  buildLearningRecord,
  isOpaqueCredentialReference,
  rankCapabilities,
  redactEvidence,
} from "@/lib/autonomous-control";
import { streamableMcpResponse } from "@/lib/mcp-transport.server";

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
  id: string;
  slug: string;
  name: string;
  description: string | null;
  resource_type: string;
  installation_type: string | null;
  installation_config: Record<string, unknown> | null;
  verified: boolean;
};

function reviewState(resource: ResourceRow) {
  return String(resource.installation_config?.["review_state"] ?? "approved");
}

function isExecutable(resource: ResourceRow) {
  return resource.verified && reviewState(resource) === "approved";
}

type McpTool = {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, boolean>;
  _meta?: Record<string, unknown>;
};

const COMMAND_CENTER_URI = "ui://open-connect/command-center-v1.html";

const COMMAND_CENTER_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font:14px system-ui;margin:0;background:#08111f;color:#e5eefb}.app{padding:18px}.head{display:flex;justify-content:space-between;gap:12px;align-items:center}.badge{padding:5px 9px;border-radius:999px;background:#12315c;color:#8fd3ff}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-top:14px}.card{border:1px solid #24415f;border-radius:12px;padding:13px;background:#0d1b2d}.muted{color:#91a6bd}.ok{color:#6ee7a8}</style></head>
<body><main class="app"><div class="head"><div><strong>Open-Connect Command Center</strong><div class="muted">Autonomous control with governed writes</div></div><span class="badge">owners + admins</span></div><section id="grid" class="grid"><div class="card">Waiting for Open-Connect status…</div></section></main>
<script>
const grid=document.getElementById('grid');
function render(data){const d=data||{};const items=[['Gateway',d.gateway||'open-connect.site'],['Resources',d.planes?.resources?.published??'—'],['Connections',d.planes?.connections?.connected??'—'],['Policy','Protected actions gated']];grid.innerHTML=items.map(([k,v])=>'<div class="card"><div class="muted">'+k+'</div><div class="ok">'+v+'</div></div>').join('')}
window.addEventListener('message',e=>{const m=e.data;if(m?.method==='ui/notifications/tool-result')render(m.params?.structuredContent||m.params?.content?.[0]?.text)});
if(window.openai?.toolOutput)render(window.openai.toolOutput);
</script></body></html>`;

/** Isolate-level cache (Cloudflare warm isolates reuse this). */
let catalogCache: {
  at: number;
  tools: McpTool[];
  bySlug: Map<string, ResourceRow>;
  byId: Map<string, ResourceRow>;
  byToolName: Map<string, ResourceRow>;
  count: number;
} | null = null;

const PLATFORM_TOOLS: McpTool[] = [
  {
    name: "search",
    description:
      "Use this when searching Open-Connect projects, providers, plugins, skills, MCP servers, tools, or runs.",
    inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "fetch",
    description: "Use this when retrieving one Open-Connect catalog item by its exact id or slug.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "open_connect_status",
    description: "Gateway status: resources, connections, models",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: { "ui/resourceUri": COMMAND_CENTER_URI, "openai/outputTemplate": COMMAND_CENTER_URI },
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
  {
    name: "inspect_connections",
    description:
      "Use this when validating connection health, scopes, and opaque credential bindings.",
    inputSchema: { type: "object", properties: { provider: { type: "string" } } },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  },
  {
    name: "e2b_health",
    description: "Check whether the configured E2B sandbox API is reachable.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  },
  {
    name: "e2b_list_sandboxes",
    description: "List running or paused E2B sandboxes for the connected team.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "integer", minimum: 1, maximum: 100 } },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  },
  {
    name: "e2b_create_sandbox",
    description: "Create an isolated E2B sandbox. Owner/admin and tools:invoke are required.",
    inputSchema: {
      type: "object",
      properties: {
        template: { type: "string", description: "E2B template id or alias; defaults to base." },
        timeout: { type: "integer", minimum: 30, maximum: 3600 },
        metadata: { type: "object", additionalProperties: { type: "string" } },
      },
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "e2b_kill_sandbox",
    description:
      "Terminate one E2B sandbox. Requires explicit confirm=true and owner/admin write access.",
    inputSchema: {
      type: "object",
      properties: {
        sandbox_id: { type: "string" },
        confirm: { type: "boolean", description: "Must be true to terminate the sandbox." },
      },
      required: ["sandbox_id", "confirm"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: "hubstaff_admin_identity",
    description: "Validate the configured Hubstaff Admin identity and granted account access.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  },
  {
    name: "hubstaff_admin_list_organizations",
    description: "List Hubstaff organizations available to the configured administrator.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  },
  {
    name: "hubstaff_admin_request",
    description:
      "Call an authorized Hubstaff v2 endpoint. Writes require owner/admin access; DELETE also requires confirm=true.",
    inputSchema: {
      type: "object",
      properties: {
        method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"] },
        path: { type: "string", description: "Hubstaff v2 path beginning with /v2/." },
        body: { type: "object", additionalProperties: true },
        confirm: { type: "boolean", description: "Required for DELETE requests." },
      },
      required: ["method", "path"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "plan_goal",
    description:
      "Use this when converting an operator goal into a bounded autonomous execution plan.",
    inputSchema: {
      type: "object",
      properties: {
        goal: { type: "string" },
        environment: { type: "string", enum: ["development", "staging", "production"] },
      },
      required: ["goal"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "execute_plan",
    description:
      "Use this when starting an autonomous plan. Safe reversible steps run automatically; protected steps create an approval request.",
    inputSchema: {
      type: "object",
      properties: {
        goal: { type: "string" },
        environment: { type: "string", enum: ["development", "staging", "production"] },
      },
      required: ["goal"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "recommend_toolchain",
    description:
      "Find the smallest approved plugin, skill, tool, app, or MCP bundle matching a goal.",
    inputSchema: {
      type: "object",
      properties: {
        goal: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 10 },
      },
      required: ["goal"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "resolve_capability",
    description:
      "Resolve one requested capability to approved catalog resources and report whether a draft is needed.",
    inputSchema: {
      type: "object",
      properties: { capability: { type: "string" } },
      required: ["capability"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "create_capability_draft",
    description:
      "Create a non-executable capability specification when no approved tool exists. It never installs code automatically.",
    inputSchema: {
      type: "object",
      properties: {
        capability: { type: "string" },
        goal: { type: "string" },
        environment: { type: "string", enum: ["development", "staging", "production"] },
      },
      required: ["capability", "goal"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "record_run_outcome",
    description:
      "Record a verified autonomous-run outcome, save redacted working memory, and promote repeated successes to knowledge.",
    inputSchema: {
      type: "object",
      properties: {
        correlation_id: { type: "string" },
        status: { type: "string", enum: ["succeeded", "failed", "blocked"] },
        summary: { type: "string" },
        capability_slugs: { type: "array", items: { type: "string" } },
        evidence: { type: "object" },
      },
      required: ["correlation_id", "status", "summary"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "install_capability",
    description:
      "Request installation of an approved capability as owner/admin. Returns unsupported until a verified provider executor is available.",
    inputSchema: {
      type: "object",
      properties: {
        resource_id: { type: "string" },
        environment: { type: "string", enum: ["development", "staging", "production"] },
      },
      required: ["resource_id"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "configure_connection",
    description:
      "Use this when binding a provider through an opaque credential:// reference; raw secret values are rejected.",
    inputSchema: {
      type: "object",
      properties: {
        provider: { type: "string" },
        display_name: { type: "string" },
        credential_ref: { type: "string" },
        scopes: { type: "array", items: { type: "string" } },
      },
      required: ["provider", "credential_ref"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
];

async function loadRoles(userId: string): Promise<string[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((row: { role: string }) => row.role);
}

async function requireControlWrite(key: AuthedKey) {
  const roles = await loadRoles(key.userId);
  const authorizedRole = roles.includes("owner") || roles.includes("admin");
  const authorizedScope =
    hasScope(key, "control:write") ||
    hasScope(key, "tools:invoke") ||
    hasScope(key, "connections:invoke");
  if (!authorizedRole || !authorizedScope)
    throw new Error("Owner/admin role and control write scope required.");
  return roles;
}

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

function executionUnavailable(operation: "invoke" | "install", resource: ResourceRow) {
  return {
    ...textResult({
      status: "unsupported",
      code: "provider_executor_unavailable",
      operation,
      resource: { slug: resource.slug, name: resource.name, type: resource.resource_type },
      execution: {
        verified: false,
        performed: false,
        message:
          "No verified provider executor is configured for this capability. Catalog approval and connection metadata do not prove execution.",
      },
    }),
    isError: true,
  };
}

function toolNameFromSlug(slug: string) {
  return `resource_${slug.replace(/[^a-z0-9_]/gi, "_").toLowerCase()}`;
}

function toolTitle(name: string) {
  return name
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function chatGptTools(key: AuthedKey) {
  // Marketplace resources are intentionally accessed through list_resources,
  // search, and fetch. Publishing every catalog row as another MCP tool creates
  // duplicate capabilities and makes ChatGPT's plugin scan brittle.
  return PLATFORM_TOOLS.filter((tool) => canUseTool(key, tool.name)).map((tool) => ({
    ...tool,
    title: tool.title ?? toolTitle(tool.name),
  }));
}

async function getCatalog(force = false) {
  const now = Date.now();
  if (!force && catalogCache && now - catalogCache.at < CATALOG_TTL_MS) {
    return catalogCache;
  }

  const { oauthDatabase } = await import("@/lib/oauth-client.server");
  const { data, error } = await oauthDatabase()
    .from("resources")
    .select(
      "id, slug, name, description, resource_type, installation_type, installation_config, verified",
    )
    .eq("published", true)
    .order("featured", { ascending: false })
    .limit(100);

  if (error) throw new Error("Resource catalog unavailable");
  const rows = (data ?? []) as ResourceRow[];
  const bySlug = new Map<string, ResourceRow>();
  const byId = new Map<string, ResourceRow>();
  const byToolName = new Map<string, ResourceRow>();
  const resourceTools: McpTool[] = [];

  for (const r of rows) {
    bySlug.set(r.slug, r);
    byId.set(r.id, r);
    if (isExecutable(r)) {
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
  }

  catalogCache = {
    at: now,
    tools: [...PLATFORM_TOOLS, ...resourceTools],
    bySlug,
    byId,
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
    .select(
      "id, slug, name, description, resource_type, installation_type, installation_config, verified",
    )
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

const TOOL_SCOPES: Record<string, string> = {
  search: "resources:read",
  fetch: "resources:read",
  open_connect_status: "mcp:connect",
  list_resources: "resources:read",
  list_connections: "connections:read",
  list_models: "models:read",
  inspect_connections: "connections:read",
  e2b_health: "connections:read",
  e2b_list_sandboxes: "connections:read",
  e2b_create_sandbox: "tools:invoke",
  e2b_kill_sandbox: "tools:invoke",
  hubstaff_admin_identity: "connections:read",
  hubstaff_admin_list_organizations: "connections:read",
  hubstaff_admin_request: "tools:invoke",
  plan_goal: "resources:read",
  recommend_toolchain: "resources:read",
  resolve_capability: "resources:read",
  execute_plan: "tools:invoke",
  create_capability_draft: "resources:write",
  record_run_outcome: "resources:write",
  configure_connection: "connections:invoke",
};

const SELF_GUARDED_WRITE_TOOLS = new Set([
  "execute_plan",
  "create_capability_draft",
  "record_run_outcome",
  "configure_connection",
  "install_capability",
  "e2b_create_sandbox",
  "e2b_kill_sandbox",
  "hubstaff_admin_request",
]);

function canUseTool(key: AuthedKey, toolName: string) {
  const required = TOOL_SCOPES[toolName] ?? "tools:invoke";
  // Preserve pre-profile keys that used the original aggregate write grant.
  return hasScope(key, required) || hasScope(key, "control:write");
}

export const Route = createFileRoute("/mcp")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const key = await authenticateKey(request);
        if (!key) return unauthorized("Missing or invalid Open-Connect key.");
        if (request.headers.get("accept")?.includes("text/event-stream")) {
          return new Response(null, {
            status: 405,
            headers: { allow: "POST", "cache-control": "no-store" },
          });
        }
        return json({
          name: "open-connect",
          version: "1.0.1",
          protocol: "mcp",
          planes: ["resources", "connections", "models", "credentials"],
          endpoints: {
            mcp: "https://open-connect.site/mcp",
            models: "https://open-connect.site/v1",
            api: "https://open-connect.site/api/v1",
            oauth: "https://open-connect.site/.well-known/oauth-authorization-server",
          },
          authenticated: true,
          user_id: key.userId,
          scopes: key.scopes,
          context: {
            organization_id: key.organizationId,
            workspace_id: key.workspaceId,
            project_id: key.projectId,
            access_profile: key.accessProfile,
          },
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
          return gatewayError(
            "Key is missing mcp, models, or resources scope.",
            403,
            "insufficient_scope",
          );
        }

        const body = (await request.json().catch(() => null)) as {
          jsonrpc?: string;
          id?: string | number;
          method?: string;
          params?: {
            name?: string;
            arguments?: Record<string, unknown>;
            protocolVersion?: string;
          };
        } | null;

        if (!body?.method) {
          return gatewayError("JSON-RPC method required.", 400, "invalid_request");
        }

        let result: unknown = { ok: true };

        if (body.method === "initialize") {
          result = {
            protocolVersion: body.params?.protocolVersion ?? "2025-06-18",
            capabilities: {
              tools: { listChanged: false },
              resources: { listChanged: false },
            },
            serverInfo: {
              name: "open-connect",
              version: "1.0.1",
              planes: ["resources", "connections", "models", "credentials"],
            },
            instructions:
              "Use read-only discovery tools before write tools. Hubstaff, E2B, connection, and credential actions are scoped to the authenticated Open-Connect account and role.",
          };
        } else if (body.method === "tools/list") {
          result = { tools: chatGptTools(key) };
        } else if (body.method === "resources/list") {
          result = {
            resources: [
              {
                uri: COMMAND_CENTER_URI,
                name: "Open-Connect Command Center",
                description: "Autonomous control status and execution view",
                mimeType: "text/html;profile=mcp-app",
              },
            ],
          };
        } else if (body.method === "resources/read") {
          const uri = (body.params as { uri?: string } | undefined)?.uri;
          result =
            uri === COMMAND_CENTER_URI
              ? {
                  contents: [
                    {
                      uri: COMMAND_CENTER_URI,
                      mimeType: "text/html;profile=mcp-app",
                      text: COMMAND_CENTER_HTML,
                      _meta: {
                        ui: {
                          domain: "https://open-connect.site",
                          prefersBorder: true,
                          csp: {
                            connectDomains: ["https://open-connect.site"],
                            resourceDomains: [],
                          },
                        },
                        "openai/widgetDescription":
                          "Open-Connect autonomous control command center",
                      },
                    },
                  ],
                }
              : { contents: [] };
        } else if (body.method === "tools/call") {
          const name = body.params?.name;
          const args = body.params?.arguments ?? {};

          if (!name || (!canUseTool(key, name) && !SELF_GUARDED_WRITE_TOOLS.has(name))) {
            return gatewayError(
              `Key cannot invoke ${name || "this tool"} in its selected scope.`,
              403,
              "insufficient_scope",
            );
          }

          if (name === "search") {
            const query = String(args["query"] ?? "").trim();
            const catalog = await getCatalog();
            const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
            const results = [...catalog.bySlug.values()]
              .filter((item) =>
                terms.every((term) =>
                  `${item.slug} ${item.name} ${item.description ?? ""} ${item.resource_type}`
                    .toLowerCase()
                    .includes(term),
                ),
              )
              .slice(0, 20)
              .map((item) => ({
                id: item.slug,
                title: item.name,
                url: `https://open-connect.site/resources/${item.slug}`,
              }));
            result = textResult({ results });
          } else if (name === "fetch") {
            const id = String(args["id"] ?? "").trim();
            const catalog = await getCatalog();
            const item = catalog.bySlug.get(id) ?? catalog.byId.get(id);
            result = textResult(
              item
                ? {
                    id: item.slug,
                    title: item.name,
                    text: item.description ?? "",
                    url: `https://open-connect.site/resources/${item.slug}`,
                    metadata: {
                      type: item.resource_type,
                      installation_type: item.installation_type,
                      review_state: reviewState(item),
                      risk: item.installation_config?.["risk"] ?? null,
                      canonical_url: item.installation_config?.["canonical_url"] ?? null,
                      executable: isExecutable(item),
                    },
                  }
                : {
                    id,
                    title: "Not found",
                    text: "No matching Open-Connect resource.",
                    url: "https://open-connect.site/resources",
                  },
            );
          } else if (name === "open_connect_status") {
            const catalog = await getCatalog();
            let connections: number | null = null;
            try {
              const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
              const response = await supabaseAdmin
                .from("app_connections")
                .select("id", { count: "exact", head: true })
                .eq("user_id", key.userId)
                .eq("status", "connected");
              if (!response.error) connections = response.count;
            } catch {
              // Status must remain available even when the optional connection counter is not.
            }
            result = textResult({
              gateway: "open-connect.site",
              planes: {
                resources: { published: catalog.count },
                connections: { connected: connections, available: connections !== null },
                models: {
                  endpoint: "https://open-connect.site/v1",
                  aliases: MODEL_ALIASES.map((a) => a.id),
                },
              },
              scopes: key.scopes,
              user_id: key.userId,
            });
          } else if (name === "inspect_connections") {
            const provider = String(args["provider"] ?? "").trim();
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            let query = supabaseAdmin
              .from("app_connections")
              .select("provider, display_name, status, scopes, credential_reference, last_used_at")
              .eq("user_id", key.userId);
            if (provider) query = query.eq("provider", provider);
            const { data } = await query.order("created_at", { ascending: false }).limit(100);
            result = textResult({
              connections: (data ?? []).map((connection: Record<string, unknown>) => ({
                ...connection,
                credential_reference: connection["credential_reference"] ? "configured" : "missing",
              })),
            });
          } else if (name === "e2b_health") {
            const { e2bConfig, e2bHealth } = await import("@/lib/e2b.server");
            if (!e2bConfig().configured) throw new Error("E2B is not configured");
            result = textResult({ configured: true, reachable: true, health: await e2bHealth() });
          } else if (name === "e2b_list_sandboxes") {
            const { e2bConfig, listE2bSandboxes } = await import("@/lib/e2b.server");
            if (!e2bConfig().configured) throw new Error("E2B is not configured");
            result = textResult(await listE2bSandboxes(Number(args["limit"] ?? 100)));
          } else if (name === "e2b_create_sandbox") {
            await requireControlWrite(key);
            const { createE2bSandbox, e2bConfig } = await import("@/lib/e2b.server");
            if (!e2bConfig().configured) throw new Error("E2B is not configured");
            const metadata =
              args["metadata"] && typeof args["metadata"] === "object"
                ? Object.fromEntries(
                    Object.entries(args["metadata"] as Record<string, unknown>)
                      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
                      .slice(0, 20),
                  )
                : {};
            const template = typeof args["template"] === "string" ? args["template"] : null;
            result = textResult(
              await createE2bSandbox({
                ...(template ? { template } : {}),
                timeout: Number(args["timeout"] ?? 300),
                metadata,
              }),
            );
          } else if (name === "e2b_kill_sandbox") {
            await requireControlWrite(key);
            if (args["confirm"] !== true) throw new Error("Explicit confirm=true is required");
            const { e2bConfig, killE2bSandbox } = await import("@/lib/e2b.server");
            if (!e2bConfig().configured) throw new Error("E2B is not configured");
            result = textResult(await killE2bSandbox(String(args["sandbox_id"] ?? "")));
          } else if (name === "hubstaff_admin_identity") {
            const { hubstaffAdminConfig, hubstaffAdminIdentity } =
              await import("@/lib/hubstaff-admin.server");
            if (!hubstaffAdminConfig().configured)
              throw new Error("Hubstaff Admin is not configured");
            result = textResult(await hubstaffAdminIdentity());
          } else if (name === "hubstaff_admin_list_organizations") {
            const { hubstaffAdminConfig, listHubstaffOrganizations } =
              await import("@/lib/hubstaff-admin.server");
            if (!hubstaffAdminConfig().configured)
              throw new Error("Hubstaff Admin is not configured");
            result = textResult(await listHubstaffOrganizations());
          } else if (name === "hubstaff_admin_request") {
            const method = String(args["method"] ?? "GET").toUpperCase();
            if (method !== "GET") await requireControlWrite(key);
            if (method === "DELETE" && args["confirm"] !== true) {
              throw new Error("Explicit confirm=true is required for DELETE");
            }
            const { hubstaffAdminConfig, hubstaffAdminRequest } =
              await import("@/lib/hubstaff-admin.server");
            if (!hubstaffAdminConfig().configured)
              throw new Error("Hubstaff Admin is not configured");
            const body =
              args["body"] && typeof args["body"] === "object"
                ? (args["body"] as Record<string, unknown>)
                : undefined;
            result = textResult(
              await hubstaffAdminRequest({
                method,
                path: String(args["path"] ?? ""),
                ...(body ? { body } : {}),
              }),
            );
          } else if (name === "recommend_toolchain" || name === "resolve_capability") {
            const goal = String(
              name === "resolve_capability" ? args["capability"] : args["goal"],
            ).trim();
            const limit = name === "resolve_capability" ? 5 : Number(args["limit"] ?? 5);
            const catalog = await getCatalog();
            const matches = rankCapabilities(
              goal,
              [...catalog.bySlug.values()].filter(isExecutable).map((item) => ({
                slug: item.slug,
                name: item.name,
                description: item.description,
                resourceType: item.resource_type,
                installationType: item.installation_type,
              })),
              limit,
            );
            result = textResult({
              goal,
              matches,
              missing_capability: matches.length === 0,
              next_action: matches.length ? "install_or_invoke" : "create_capability_draft",
              values_exposed: false,
            });
          } else if (name === "plan_goal") {
            const catalog = await getCatalog();
            result = textResult(
              buildAdaptivePlan(
                String(args["goal"] ?? ""),
                String(args["environment"] ?? "production"),
                [...catalog.bySlug.values()].filter(isExecutable).map((item) => ({
                  slug: item.slug,
                  name: item.name,
                  description: item.description,
                  resourceType: item.resource_type,
                  installationType: item.installation_type,
                })),
              ),
            );
          } else if (name === "execute_plan") {
            await requireControlWrite(key);
            const catalog = await getCatalog();
            const plan = buildAdaptivePlan(
              String(args["goal"] ?? ""),
              String(args["environment"] ?? "production"),
              [...catalog.bySlug.values()].map((item) => ({
                slug: item.slug,
                name: item.name,
                description: item.description,
                resourceType: item.resource_type,
                installationType: item.installation_type,
              })),
            );
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            // Generated Supabase types lag new migrations until the next type-generation job.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const controlDb = supabaseAdmin as any;
            const state = plan.approvalRequired ? "approval_required" : "planned";
            await controlDb.from("autonomous_runs").upsert({
              id: plan.id,
              user_id: key.userId,
              goal: plan.goal,
              environment: plan.environment,
              state,
              plan: redactEvidence(plan),
              evidence: {
                verified: false,
                capability_count: plan.capabilities.length,
                values_exposed: false,
              },
              rollback: { available: true },
              correlation_id: plan.id,
            });
            await controlDb.from("autonomous_run_events").insert({
              user_id: key.userId,
              run_id: plan.id,
              event_type: "planned",
              summary: plan.missingCapability
                ? "No approved capability matched; a draft specification was created."
                : `Selected ${plan.capabilities.length} approved capability candidate(s).`,
              capability_slugs: plan.capabilities.map((capability) => capability.slug),
              evidence: { values_exposed: false },
            });
            if (plan.missingCapability) {
              await controlDb.from("capability_requests").insert({
                user_id: key.userId,
                source_run_id: plan.id,
                requested_capability: plan.goal.slice(0, 240),
                goal: plan.goal,
                state: "draft",
                specification: {
                  generated_by: "open-connect",
                  executable: false,
                  required_contract: [
                    "input_schema",
                    "output_schema",
                    "credential_reference",
                    "health_check",
                    "approval_policy",
                    "tests",
                  ],
                },
              });
            }
            if (plan.approvalRequired) {
              await controlDb.from("control_approvals").insert({
                tenant_id: key.userId,
                requested_by: key.userId,
                action: "execute_plan",
                target: plan.goal,
                environment: plan.environment,
                risk: "protected",
                parameters_digest: plan.id,
                expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
              });
            }
            result = textResult({
              correlation_id: plan.id,
              state,
              plan,
              autonomous_steps_executed: plan.approvalRequired
                ? ["discover"]
                : ["discover", "plan"],
            });
          } else if (name === "create_capability_draft") {
            await requireControlWrite(key);
            const capability = String(args["capability"] ?? "")
              .trim()
              .slice(0, 240);
            const goal = String(args["goal"] ?? "")
              .trim()
              .slice(0, 4_000);
            if (!capability || !goal) throw new Error("Capability and goal are required.");
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            // Generated Supabase types lag new migrations until the next type-generation job.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const controlDb = supabaseAdmin as any;
            const { data, error } = await controlDb
              .from("capability_requests")
              .insert({
                user_id: key.userId,
                requested_capability: capability,
                goal,
                state: "draft",
                specification: {
                  environment: String(args["environment"] ?? "development"),
                  executable: false,
                  required_contract: [
                    "input_schema",
                    "output_schema",
                    "credential_reference",
                    "health_check",
                    "approval_policy",
                    "tests",
                  ],
                },
              })
              .select("id,requested_capability,state,created_at")
              .single();
            if (error) throw new Error(error.message);
            result = textResult({ draft: data, executable: false, values_exposed: false });
          } else if (name === "record_run_outcome") {
            await requireControlWrite(key);
            const correlationId = String(args["correlation_id"] ?? "").trim();
            const status = String(args["status"] ?? "") as "succeeded" | "failed" | "blocked";
            const summary = String(args["summary"] ?? "")
              .trim()
              .slice(0, 50_000);
            const capabilitySlugs = Array.isArray(args["capability_slugs"])
              ? args["capability_slugs"]
                  .filter((value): value is string => typeof value === "string")
                  .slice(0, 20)
              : [];
            if (!correlationId || !["succeeded", "failed", "blocked"].includes(status) || !summary)
              throw new Error("Valid correlation id, status, and summary are required.");
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            // Generated Supabase types lag new migrations until the next type-generation job.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const controlDb = supabaseAdmin as any;
            const { data: run } = await controlDb
              .from("autonomous_runs")
              .select("id,goal")
              .eq("correlation_id", correlationId)
              .eq("user_id", key.userId)
              .single();
            if (!run) throw new Error("Autonomous run not found.");
            const learning = buildLearningRecord({
              goal: run.goal,
              status,
              summary,
              capabilitySlugs,
              evidence: args["evidence"],
            });
            await controlDb.from("autonomous_run_events").insert({
              user_id: key.userId,
              run_id: run.id,
              event_type: status === "succeeded" ? "learned" : status,
              summary: learning.content,
              capability_slugs: capabilitySlugs,
              evidence: learning.evidence,
            });
            await controlDb.from("memory_records").insert({
              user_id: key.userId,
              title: learning.title,
              content: learning.content,
              memory_type: learning.memoryType,
              importance: learning.importance,
              tags: learning.tags,
              metadata: { run_id: run.id, evidence: learning.evidence },
            });
            let knowledgePromoted = false;
            if (status === "succeeded" && capabilitySlugs.length) {
              const { count } = await controlDb
                .from("autonomous_run_events")
                .select("id", { count: "exact", head: true })
                .eq("user_id", key.userId)
                .eq("event_type", "learned")
                .contains("capability_slugs", capabilitySlugs);
              if (count === 3) {
                await controlDb.from("knowledge_items").insert({
                  user_id: key.userId,
                  title: `Proven procedure: ${capabilitySlugs.join(", ")}`.slice(0, 240),
                  content: learning.content,
                  source_type: "api",
                  status: "ready",
                  tags: ["verified-procedure", ...capabilitySlugs].slice(0, 20),
                  metadata: { promoted_from_run: run.id, verified_successes: 3 },
                });
                knowledgePromoted = true;
              }
            }
            await controlDb
              .from("autonomous_runs")
              .update({
                state: status === "succeeded" ? "succeeded" : "failed",
                evidence: learning.evidence,
                updated_at: new Date().toISOString(),
              })
              .eq("id", run.id)
              .eq("user_id", key.userId);
            result = textResult({
              correlation_id: correlationId,
              state: status,
              memory_saved: true,
              knowledge_promoted: knowledgePromoted,
              values_exposed: false,
            });
          } else if (name === "install_capability") {
            await requireControlWrite(key);
            const slug = String(args["resource_id"] ?? "").trim();
            const catalog = await getCatalog();
            const item = catalog.bySlug.get(slug);
            if (!item) throw new Error("Unknown or unpublished capability.");
            if (!isExecutable(item))
              throw new Error(`Capability is ${reviewState(item)} and cannot be installed.`);
            result = executionUnavailable("install", item);
          } else if (name === "configure_connection") {
            await requireControlWrite(key);
            const provider = String(args["provider"] ?? "")
              .trim()
              .toLowerCase();
            const credentialRef = String(args["credential_ref"] ?? "").trim();
            if (!provider || !isOpaqueCredentialReference(credentialRef))
              throw new Error(
                "Provider and valid credential:// reference required; raw secrets are rejected.",
              );
            const scopes = Array.isArray(args["scopes"])
              ? args["scopes"].filter((scope): scope is string => typeof scope === "string")
              : [];
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { data, error } = await supabaseAdmin
              .from("app_connections")
              .upsert(
                {
                  user_id: key.userId,
                  provider,
                  display_name: String(args["display_name"] ?? provider),
                  provider_account_id: key.userId,
                  status: "connected",
                  scopes,
                  credential_reference: credentialRef,
                  metadata: {
                    source: "chatgpt-mcp",
                    mode: "capability_grant",
                    secrets_exposed: false,
                  },
                },
                { onConflict: "user_id,provider,provider_account_id" },
              )
              .select("id,provider,display_name,status,scopes")
              .single();
            if (error) throw new Error(error.message);
            result = textResult({
              connection: data,
              credential_reference: "configured",
              idempotent: true,
            });
          } else if (name === "list_resources") {
            const catalog = await getCatalog();
            const typeFilter = typeof args["type"] === "string" ? args["type"] : null;
            const data = [...catalog.bySlug.values()]
              .filter((r) => !typeFilter || r.resource_type === typeFilter)
              .map((r) => ({
                slug: r.slug,
                name: r.name,
                type: r.resource_type,
                description: r.description,
                review_state: reviewState(r),
                risk: r.installation_config?.["risk"] ?? null,
                canonical_url: r.installation_config?.["canonical_url"] ?? null,
                executable: isExecutable(r),
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
            const action = typeof args["action"] === "string" ? args["action"] : "info";

            if (!match) {
              result = textResult({ status: "not_found", tool: name });
            } else if (action === "invoke" && !isExecutable(match)) {
              result = textResult({
                status: reviewState(match),
                resource: { slug: match.slug, name: match.name, type: match.resource_type },
                risk: match.installation_config?.["risk"] ?? null,
                message:
                  "Metadata-only resource cannot be invoked until review and approval are complete.",
              });
            } else if (action === "invoke") {
              result = executionUnavailable("invoke", match);
            } else {
              result = textResult({
                status: "available",
                resource: match,
                note: "Catalog metadata only; provider execution is not configured.",
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
        return streamableMcpResponse(request, body, {
          jsonrpc: "2.0",
          id: body.id ?? null,
          result,
        });
      },
    },
  },
});
