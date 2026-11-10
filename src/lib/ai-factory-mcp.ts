/**
 * MCP endpoint for the AI Factory roster: `/ai-factory/mcp`.
 *
 * The roster is a static sub-site, so there is no database behind it and no
 * per-agent runtime to execute. What CAN be served honestly is the roster's
 * own data: the 103 agents and their portable exports, which are generated at
 * build time into `public/ai-factory/roster/data/exports/` and read here from
 * the ASSETS binding.
 *
 * So this is a real, working MCP server — JSON-RPC 2.0 over HTTP, stateless,
 * read-only — that lets ChatGPT, Claude, Hermes or any other MCP client pull an
 * agent's definition and drop it into its own runtime. It deliberately exposes
 * no execution tool: there is no agent runtime behind this endpoint, and
 * claiming one would be the exact dishonesty the roster's connector rule
 * forbids.
 *
 * Transport: POST with a JSON-RPC body, response is `application/json`.
 * No auth: the roster is public. No session: every request is independent.
 */

export const AI_FACTORY_MCP_PATH = "/ai-factory/mcp";

const EXPORT_PREFIX = "/ai-factory/roster/data/exports/";
const FORMATS = ["neutral", "chatgpt", "claude", "hermes", "prompt"] as const;
type Format = (typeof FORMATS)[number];

const PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = { name: "open-connect-ai-factory", version: "1.0.0" };

const TOOLS = [
  {
    name: "ai_factory_list_agents",
    description:
      "List every AI Factory agent: slug, name, description, team, niche and live-connector count. Use this to discover which agent to pull.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "ai_factory_get_agent",
    description:
      "Fetch one agent's neutral seven-field export (name, description, instruction, knowledge, tools, skills, connectors) plus team, niche, slug and avatar.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Agent slug, e.g. account-manager" },
      },
      required: ["slug"],
      additionalProperties: false,
    },
  },
  {
    name: "ai_factory_get_export",
    description:
      "Fetch one agent's export in a specific runtime format: neutral, chatgpt, claude, hermes or prompt.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Agent slug" },
        format: { type: "string", enum: [...FORMATS], description: "Target runtime format" },
      },
      required: ["slug", "format"],
      additionalProperties: false,
    },
  },
] as const;

type Assets = { fetch: (request: Request) => Promise<Response> };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
    },
  });
}

function rpcResult(id: unknown, result: unknown): Response {
  return json({ jsonrpc: "2.0", id, result });
}

function rpcError(id: unknown, code: number, message: string): Response {
  return json({ jsonrpc: "2.0", id, error: { code, message } });
}

/**
 * Where the export files are read from.
 *
 * On Cloudflare Pages Functions the static site is exposed as the `ASSETS`
 * binding. This project deploys as a Worker (see wrangler.toml), where that
 * binding does not exist — so fall back to an HTTP read of the same origin
 * rather than failing every tool call with -32603.
 */
type AssetSource = { fetch(request: Request): Promise<Response> };

function assetSource(assets: Assets | undefined, origin: string): AssetSource {
  if (assets) return assets;
  return {
    fetch: (request: Request) =>
      fetch(new URL(new URL(request.url).pathname, origin).toString(), {
        method: "GET",
        headers: { accept: "*/*" },
      }),
  };
}

/** Read a JSON document from the static asset layer. */
async function readAsset(
  assets: AssetSource,
  origin: string,
  path: string,
): Promise<unknown | null> {
  const response = await assets.fetch(
    new Request(new URL(path, origin).toString(), {
      method: "GET",
      headers: { accept: "*/*" },
    }),
  );
  if (response.status !== 200) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

type IndexEntry = {
  slug: string;
  name: string;
  description: string;
  team: string | null;
  niche: string | null;
  driver: string | null;
  live_connectors: number;
};

async function loadIndex(assets: AssetSource, origin: string): Promise<IndexEntry[] | null> {
  const index = (await readAsset(assets, origin, `${EXPORT_PREFIX}index.json`)) as {
    agents?: IndexEntry[];
  } | null;
  return index?.agents ?? null;
}

function textResult(payload: unknown) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    isError: false,
  };
}

function errorResult(message: string) {
  return { content: [{ type: "text", text: message }], isError: true };
}

async function callTool(
  assets: AssetSource,
  origin: string,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (name === "ai_factory_list_agents") {
    const agents = await loadIndex(assets, origin);
    if (!agents)
      return errorResult("The AI Factory export index is not available on this deployment.");
    return textResult({ count: agents.length, agents });
  }

  if (name === "ai_factory_get_agent" || name === "ai_factory_get_export") {
    const slug = typeof args["slug"] === "string" ? (args["slug"] as string).trim() : "";
    if (!slug) return errorResult("`slug` is required.");
    // Slugs are lowercase kebab; reject anything else so a crafted value cannot
    // walk out of the export directory.
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return errorResult(`Invalid slug: ${slug}`);

    let format: Format = "neutral";
    if (name === "ai_factory_get_export") {
      const requested = typeof args["format"] === "string" ? (args["format"] as string) : "";
      if (!FORMATS.includes(requested as Format)) {
        return errorResult(`Invalid format: ${requested}. Expected one of ${FORMATS.join(", ")}.`);
      }
      format = requested as Format;
    }

    const ext = format === "prompt" ? "md" : "json";
    const path = `${EXPORT_PREFIX}${format}/${slug}.${ext}`;
    const response = await assets.fetch(
      new Request(new URL(path, origin).toString(), {
        method: "GET",
        headers: { accept: "*/*" },
      }),
    );
    if (response.status !== 200) {
      return errorResult(
        `No ${format} export for agent "${slug}". Use ai_factory_list_agents to see valid slugs.`,
      );
    }
    const body = await response.text();
    return { content: [{ type: "text", text: body }], isError: false };
  }

  return errorResult(`Unknown tool: ${name}`);
}

/**
 * Handle an MCP request. Returns null when the path is not the MCP endpoint so
 * the caller can fall through to normal routing.
 */
export async function handleAiFactoryMcp(request: Request, env: unknown): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname.replace(/\/+$/, "") !== AI_FACTORY_MCP_PATH) return null;

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST, GET, OPTIONS",
        "access-control-allow-headers": "Content-Type, Authorization, Mcp-Session-Id",
      },
    });
  }

  // A GET is a discovery convenience, not an SSE stream: return the manifest so
  // a human or a client can see what this endpoint offers.
  if (request.method === "GET") {
    return json({
      name: SERVER_INFO.name,
      version: SERVER_INFO.version,
      protocolVersion: PROTOCOL_VERSION,
      transport: "http-json-rpc",
      description:
        "Read-only MCP access to the Open-Connect AI Factory roster. Serves agent definitions and portable exports; does not execute agents.",
      tools: TOOLS,
      limits: [
        "Read-only. No agent can be executed through this endpoint.",
        "No credentials are served; connector status is reported, not granted.",
        "Stateless: no session, no auth, public roster data only.",
      ],
    });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed. Use POST with a JSON-RPC body." }, 405);
  }

  const assets = assetSource((env as { ASSETS?: Assets })?.ASSETS, url.origin);

  let body: { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return rpcError(null, -32700, "Parse error: body is not valid JSON.");
  }

  const { id, method, params } = body;

  // Notifications carry no id and expect no response body.
  if (method === "notifications/initialized" || method === "notifications/cancelled") {
    return new Response(null, { status: 202, headers: { "access-control-allow-origin": "*" } });
  }

  if (method === "initialize") {
    return rpcResult(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER_INFO,
      instructions:
        "Open-Connect AI Factory roster. Use ai_factory_list_agents to discover agents, then ai_factory_get_agent or ai_factory_get_export to pull one into your runtime. Read-only: this endpoint serves definitions, it does not run agents.",
    });
  }

  if (method === "ping") return rpcResult(id, {});

  if (method === "tools/list") return rpcResult(id, { tools: TOOLS });

  if (method === "tools/call") {
    const name = typeof params?.["name"] === "string" ? (params["name"] as string) : "";
    const args = (params?.["arguments"] as Record<string, unknown>) ?? {};
    const result = await callTool(assets, url.origin, name, args);
    return rpcResult(id, result);
  }

  return rpcError(id, -32601, `Method not found: ${method}`);
}
