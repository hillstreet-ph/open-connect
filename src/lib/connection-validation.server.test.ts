import assert from "node:assert/strict";
import test from "node:test";
import { normalizeConnectionSetup } from "./connection-setup.ts";
import { validateConnectionCredential } from "./connection-validation.server.ts";

const app = (provider: string) => ({
  provider,
  display_name: provider,
  scopes: ["read"],
  oauth: false,
});

test("validates a custom MCP server with initialize", async () => {
  const setup = normalizeConnectionSetup(
    { provider: "custom_mcp", endpoint_url: "https://mcp.example/mcp", api_key: "test-secret" },
    app("custom_mcp"),
  );
  const result = await validateConnectionCredential(setup, async (_url, init) => {
    if (init?.method === "GET") return new Response(null, { status: 405 });
    const message = JSON.parse(String(init?.body));
    if (!message.id && message.id !== 0) return new Response(null, { status: 202 });
    return Response.json({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        serverInfo: { name: "fixture", version: "1" },
      },
    });
  });
  assert.equal(result.verified, true);
  assert.equal(result.accountId, "fixture");
});

test("validates the Apify remote MCP provider with initialize", async () => {
  const setup = normalizeConnectionSetup(
    { provider: "apify_mcp", endpoint_url: "https://mcp.apify.com", api_key: "test-secret" },
    app("apify_mcp"),
  );
  const result = await validateConnectionCredential(setup, async (_url, init) => {
    if (init?.method === "GET") return new Response(null, { status: 405 });
    const message = JSON.parse(String(init?.body));
    if (!message.id && message.id !== 0) return new Response(null, { status: 202 });
    return Response.json({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        serverInfo: { name: "apify-fixture", version: "1" },
      },
    });
  });
  assert.equal(result.verified, true);
  assert.equal(result.accountId, "apify-fixture");
});

test("does not mark unsupported provider validation as verified", async () => {
  const setup = normalizeConnectionSetup(
    { provider: "proton_pass", api_key: "test-secret" },
    app("proton_pass"),
  );
  const result = await validateConnectionCredential(setup);
  assert.equal(result.verified, false);
});

test("compatible model providers validate against canonical API URLs and reject HTML responses", async () => {
  const cases = [
    ["kilo", "https://ai-gateway.kilo.ai/api/v1/models"],
    ["commandcode", "https://api.commandcode.ai/provider/v1/models"],
    ["huggingface", "https://router.huggingface.co/v1/models"],
    ["groq", "https://api.groq.com/openai/v1/models"],
  ];
  for (const [provider, endpoint] of cases) {
    const setup = normalizeConnectionSetup(
      { provider: provider!, api_key: "test-secret", endpoint_url: "https://wrong.example/" },
      app(provider!),
    );
    const result = await validateConnectionCredential(setup, async (url, init) => {
      assert.equal(String(url), endpoint);
      assert.equal(
        (init?.headers as Record<string, string>)["Authorization"],
        "Bearer test-secret",
      );
      return Response.json({ data: [] });
    });
    assert.equal(result.verified, true);
    await assert.rejects(
      validateConnectionCredential(setup, async () => new Response("<html>login</html>")),
      /valid model catalog/,
    );
  }
});

test("custom API profiles remain unverified and never probe arbitrary REST URLs", async () => {
  const setup = normalizeConnectionSetup(
    {
      provider: "custom_api",
      endpoint_url: "https://api.example.com/v1",
      api_key: "",
      auth_type: "none",
      display_name: "My API",
    },
    app("custom_api"),
  );
  const result = await validateConnectionCredential(setup, async () => {
    throw new Error("Must not execute a request");
  });
  assert.equal(result.verified, false);
});

test("browser provider verification is read-only and uses official keyed hosts", async () => {
  for (const provider of ["browser_use", "browserbase"]) {
    const setup = normalizeConnectionSetup(
      { provider, api_key: "mock-browser-key", endpoint_url: "https://untrusted.example" },
      app(provider),
    );
    let calls = 0;
    const result = await validateConnectionCredential(setup, async (url, init) => {
      calls++;
      assert.equal(init?.method ?? "GET", "GET");
      const expected =
        provider === "browser_use"
          ? "https://api.browser-use.com/api/v2/billing/account"
          : "https://api.browserbase.com/v1/projects";
      assert.equal(String(url), expected);
      assert.equal(
        new Headers(init?.headers).get(
          provider === "browser_use" ? "X-Browser-Use-API-Key" : "X-BB-API-Key",
        ),
        "mock-browser-key",
      );
      return Response.json(
        provider === "browser_use" ? { projectId: "fixture" } : [{ id: "fixture" }],
      );
    });
    assert.equal(result.verified, true);
    assert.equal(calls, 1);
  }
});
