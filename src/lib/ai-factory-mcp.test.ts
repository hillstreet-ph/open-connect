/**
 * Contract tests for the AI Factory MCP endpoint.
 *
 * The endpoint reads the roster's generated exports. On Cloudflare Pages that
 * is the `ASSETS` binding; this project deploys as a Worker, where the binding
 * does not exist. These tests pin the fallback: with no ASSETS binding the
 * handler must still serve tools by reading the same origin over HTTP, instead
 * of failing every call with -32603.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { AI_FACTORY_MCP_PATH, handleAiFactoryMcp } from "./ai-factory-mcp.ts";

const ORIGIN = "https://open-connect.site";

const INDEX = {
  count: 2,
  agents: [
    {
      slug: "account-manager",
      name: "Bridge",
      description: "Grows the account.",
      team: "client",
      niche: "business-operations",
      driver: "human-led",
      live_connectors: 2,
    },
    {
      slug: "research-lead",
      name: "Scout",
      description: "Finds the signal.",
      team: "insight",
      niche: "research",
      driver: "agent-led",
      live_connectors: 0,
    },
  ],
};

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Stub the network so the fallback path is exercised without a live site. */
function stubFetch(handler: (url: string) => Response | null) {
  const seen: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    seen.push(url);
    const res = handler(url);
    if (res) return res;
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return seen;
}

function rpc(method: string, params?: Record<string, unknown>, id: unknown = 1) {
  return new Request(`${ORIGIN}${AI_FACTORY_MCP_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
}

describe("ai-factory MCP endpoint", () => {
  it("returns null for other paths so routing can continue", async () => {
    const res = await handleAiFactoryMcp(
      new Request(`${ORIGIN}/somewhere-else`, { method: "POST" }),
      {},
    );
    assert.equal(res, null);
  });

  it("serves the manifest on GET without needing the asset binding", async () => {
    const res = await handleAiFactoryMcp(
      new Request(`${ORIGIN}${AI_FACTORY_MCP_PATH}`, { method: "GET" }),
      {},
    );
    assert.ok(res);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { tools: { name: string }[] };
    assert.equal(body.tools.length, 3);
  });

  it("initializes with no ASSETS binding (Worker deployment)", async () => {
    stubFetch(() => null);
    const res = await handleAiFactoryMcp(rpc("initialize", {}), {});
    assert.ok(res);
    const body = (await res.json()) as { result?: { serverInfo?: { name: string } } };
    assert.equal(body.result?.serverInfo?.name, "open-connect-ai-factory");
  });

  it("lists the three read-only tools", async () => {
    stubFetch(() => null);
    const res = await handleAiFactoryMcp(rpc("tools/list"), {});
    assert.ok(res);
    const body = (await res.json()) as { result: { tools: { name: string }[] } };
    const names = body.result.tools.map((t) => t.name).sort();
    assert.deepEqual(names, [
      "ai_factory_get_agent",
      "ai_factory_get_export",
      "ai_factory_list_agents",
    ]);
  });

  it("falls back to HTTP when ASSETS is absent and returns the agent count", async () => {
    const seen = stubFetch((url) =>
      url.endsWith("/ai-factory/roster/data/exports/index.json")
        ? new Response(JSON.stringify(INDEX), { status: 200 })
        : null,
    );
    const res = await handleAiFactoryMcp(rpc("tools/call", { name: "ai_factory_list_agents", arguments: {} }), {});
    assert.ok(res);
    const body = (await res.json()) as {
      result: { isError: boolean; content: { text: string }[] };
    };
    assert.equal(body.result.isError, false);
    const payload = JSON.parse(body.result.content[0].text) as { count: number };
    assert.equal(payload.count, 2);
    assert.ok(seen.some((u) => u.endsWith("/data/exports/index.json")));
  });

  it("prefers the ASSETS binding when it is present", async () => {
    let bindingUsed = false;
    const assets = {
      fetch: async (req: Request) => {
        bindingUsed = true;
        assert.ok(req.url.endsWith("/data/exports/index.json"));
        return new Response(JSON.stringify(INDEX), { status: 200 });
      },
    };
    stubFetch(() => {
      throw new Error("network must not be used when ASSETS is bound");
    });
    const res = await handleAiFactoryMcp(
      rpc("tools/call", { name: "ai_factory_list_agents", arguments: {} }),
      { ASSETS: assets },
    );
    assert.ok(res);
    assert.equal(bindingUsed, true);
  });

  it("rejects a slug that could walk out of the export directory", async () => {
    stubFetch(() => null);
    const res = await handleAiFactoryMcp(
      rpc("tools/call", { name: "ai_factory_get_agent", arguments: { slug: "../../etc/passwd" } }),
      {},
    );
    assert.ok(res);
    const body = (await res.json()) as { result: { isError: boolean } };
    assert.equal(body.result.isError, true);
  });

  it("rejects an unknown export format", async () => {
    stubFetch(() => null);
    const res = await handleAiFactoryMcp(
      rpc("tools/call", {
        name: "ai_factory_get_export",
        arguments: { slug: "account-manager", format: "yaml" },
      }),
      {},
    );
    assert.ok(res);
    const body = (await res.json()) as { result: { isError: boolean } };
    assert.equal(body.result.isError, true);
  });
});
