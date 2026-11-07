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

test("Stripe restricted keys remain unverified without Customer read access", async () => {
  const setup = normalizeConnectionSetup(
    { provider: "stripe", api_key: "rk_test_fixture" },
    app("stripe"),
  );
  let calls = 0;
  const result = await validateConnectionCredential(setup, async (url, init) => {
    calls++;
    assert.equal(String(url), "https://api.stripe.com/v1/customers?limit=1");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer rk_test_fixture");
    assert.equal(init?.redirect, "manual");
    assert.equal(init?.cache, "no-store");
    assert.ok(init?.signal);
    return new Response(null, { status: 403 });
  });
  assert.equal(calls, 1);
  assert.equal(result.verified, false);
  assert.match(result.detail, /remains unverified/);
});

test("Stripe authentication, redirect, rate-limit and service failures still reject", async () => {
  const setup = normalizeConnectionSetup(
    { provider: "stripe", api_key: "rk_test_fixture" },
    app("stripe"),
  );
  for (const status of [401, 302, 429, 500]) {
    await assert.rejects(
      validateConnectionCredential(setup, async () => new Response(null, { status })),
      new RegExp(`HTTP ${status}`),
    );
  }
});

test("other providers do not accept permission denials", async () => {
  const setup = normalizeConnectionSetup({ provider: "e2b", api_key: "e2b_fixture" }, app("e2b"));
  await assert.rejects(
    validateConnectionCredential(setup, async () => new Response(null, { status: 403 })),
    /HTTP 403/,
  );
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
    { provider: "unsupported_fixture", api_key: "test-secret" },
    app("unsupported_fixture"),
  );
  const result = await validateConnectionCredential(setup);
  assert.equal(result.verified, false);
});

test("compatible model providers validate custom OpenAI-compatible endpoints and reject HTML responses", async () => {
  const cases = [
    ["kilo", "https://ai-gateway.kilo.ai/api/v1", "https://custom.example/v1/models"],
    ["huggingface", "https://router.huggingface.co/v1", "https://custom.example/v1/models"],
    ["groq", "https://api.groq.com/openai/v1", "https://custom.example/v1/models"],
    // Legacy preset providers keep their fixed canonical URL.
    [
      "commandcode",
      "https://api.commandcode.ai/provider/v1",
      "https://api.commandcode.ai/provider/v1/models",
    ],
  ];
  for (const [provider, canonical, endpoint] of cases) {
    // A saved custom public HTTPS endpoint is validated directly.
    const custom = normalizeConnectionSetup(
      { provider: provider!, api_key: "test-secret", endpoint_url: "https://custom.example/v1" },
      app(provider!),
    );
    const customResult = await validateConnectionCredential(custom, async (url, init) => {
      assert.equal(String(url), endpoint);
      assert.equal(
        (init?.headers as Record<string, string>)["Authorization"],
        "Bearer test-secret",
      );
      return Response.json({ data: [] });
    });
    assert.equal(customResult.verified, true);
    // Without a custom endpoint, validation uses the canonical API URL.
    const canonicalSetup = normalizeConnectionSetup(
      { provider: provider!, api_key: "test-secret" },
      app(provider!),
    );
    const canonicalResult = await validateConnectionCredential(canonicalSetup, async (url) => {
      assert.equal(String(url), canonical + "/models");
      return Response.json({ data: [] });
    });
    assert.equal(canonicalResult.verified, true);
    await assert.rejects(
      validateConnectionCredential(custom, async () => new Response("<html>login</html>")),
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

test("native model providers require a valid model catalog response", async () => {
  for (const [provider, body] of [
    ["anthropic", { data: [{ id: "test" }] }],
    ["google", { models: [{ name: "test" }] }],
  ] as const) {
    const setup = normalizeConnectionSetup({ provider, api_key: "test-secret" }, app(provider));
    const result = await validateConnectionCredential(setup, async () => Response.json(body));
    assert.equal(result.verified, true);
    assert.match(result.detail, /1 models fetched/);
    await assert.rejects(
      validateConnectionCredential(setup, async () => new Response("<html>login</html>")),
      /valid model catalog/,
    );
  }
});

test("Cohere validates through its authenticated native model catalog", async () => {
  const setup = normalizeConnectionSetup(
    { provider: "cohere", api_key: "cohere-fixture-key" },
    app("cohere"),
  );
  const result = await validateConnectionCredential(setup, async (url, init) => {
    assert.equal(String(url), "https://api.cohere.com/v1/models");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer cohere-fixture-key");
    assert.equal(init?.method ?? "GET", "GET");
    return Response.json({ models: [{ name: "command-a" }] });
  });
  assert.equal(result.verified, true);
  assert.match(result.detail, /1 models fetched/);
  await assert.rejects(
    validateConnectionCredential(setup, async () => new Response(null, { status: 401 })),
    /HTTP 401/,
  );
  await assert.rejects(
    validateConnectionCredential(setup, async () => Response.json({ data: [] })),
    /valid model catalog/,
  );
});

test("Novita never verifies a credential from its public catalog", async () => {
  for (const endpoint of [undefined, "https://api.novita.ai/openai/v1"]) {
    const setup = normalizeConnectionSetup(
      {
        provider: "novita",
        api_key: "definitely-invalid-key",
        ...(endpoint ? { endpoint_url: endpoint } : {}),
      },
      app("novita"),
    );
    let requests = 0;
    const result = await validateConnectionCredential(setup, async () => {
      requests++;
      return Response.json({ data: [{ id: "public-model" }] });
    });
    assert.equal(result.verified, false);
    assert.equal(requests, 0, "neither public catalog nor paid inference can validate this key");
    assert.match(result.detail, /public model catalog cannot verify/);
  }
});

test("Cohere and Novita retain separately hosted compatible endpoint validation", async () => {
  for (const provider of ["cohere", "novita"]) {
    const setup = normalizeConnectionSetup(
      { provider, api_key: "custom-fixture-key", endpoint_url: "https://custom.example/v1" },
      app(provider),
    );
    const result = await validateConnectionCredential(setup, async (url, init) => {
      assert.equal(String(url), "https://custom.example/v1/models");
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer custom-fixture-key");
      return Response.json({ data: [{ id: "private-model" }] });
    });
    assert.equal(result.verified, true);
  }
});

test("native tool providers validate with read-only requests", async () => {
  const cases = [
    {
      provider: "telegram",
      key: "123456789:AAExample_token_value_1234567890",
      url: "https://api.telegram.org/bot123456789:AAExample_token_value_1234567890/getMe",
      body: { ok: true, result: { id: 1, username: "fixture_bot" } },
      accountId: "fixture_bot",
    },
    {
      provider: "e2b",
      key: "e2b_fixture_key",
      url: "https://api.e2b.dev/sandboxes?limit=1",
      body: [],
    },
    {
      provider: "hubstaff_admin",
      key: "hubstaff_fixture_token",
      url: "https://api.hubstaff.com/v2/users/me",
      body: { user: { id: 42 } },
      accountId: "42",
    },
    {
      provider: "stripe",
      key: "sk_test_fixture_key",
      url: "https://api.stripe.com/v1/customers?limit=1",
      body: { object: "list", data: [] },
    },
  ];
  for (const item of cases) {
    const setup = normalizeConnectionSetup(
      { provider: item.provider, api_key: item.key },
      app(item.provider),
    );
    const result = await validateConnectionCredential(setup, async (url) => {
      assert.equal(String(url), item.url);
      return Response.json(item.body);
    });
    assert.equal(result.verified, true);
    if (item.accountId) assert.equal(result.accountId, item.accountId);
  }
  const telegramSetup = normalizeConnectionSetup(
    { provider: "telegram", api_key: "not-a-bot-token" },
    app("telegram"),
  );
  await assert.rejects(
    validateConnectionCredential(telegramSetup, async () => Response.json({})),
    /bot token/,
  );
});

test("native tool validators reject malformed successful responses", async () => {
  for (const provider of ["telegram", "e2b", "hubstaff_admin", "stripe"]) {
    const setup = normalizeConnectionSetup(
      {
        provider,
        api_key:
          provider === "telegram" ? "123456789:AAExample_token_value_1234567890" : "fixture-token",
      },
      app(provider),
    );
    for (const body of [{}, { ok: true, result: {} }, { user: {} }, { object: "list" }]) {
      await assert.rejects(validateConnectionCredential(setup, async () => Response.json(body)));
    }
    await assert.rejects(
      validateConnectionCredential(setup, async () => new Response("<html>login</html>")),
    );
  }
});

test("generic endpoint validation verifies OpenAI-compatible catalogs for any provider", async () => {
  const setup = normalizeConnectionSetup(
    {
      provider: "unknown_fixture",
      api_key: "test-secret",
      endpoint_url: "https://api.example.com/v1",
    },
    app("unknown_fixture"),
  );
  const result = await validateConnectionCredential(setup, async (url, init) => {
    assert.equal(String(url), "https://api.example.com/v1/models");
    assert.equal((init?.headers as Record<string, string>)["Authorization"], "Bearer test-secret");
    return Response.json({ data: [{ id: "m1" }, { id: "m2" }] });
  });
  assert.equal(result.verified, true);
  assert.match(result.detail, /2 models fetched/);
});

test("generic endpoint validation accepts Gemini-style model catalogs", async () => {
  const setup = normalizeConnectionSetup(
    {
      provider: "unknown_fixture",
      api_key: "test-secret",
      endpoint_url: "https://api.example.com/v1",
    },
    app("unknown_fixture"),
  );
  const result = await validateConnectionCredential(setup, async () =>
    Response.json({ models: [{ name: "m1" }] }),
  );
  assert.equal(result.verified, true);
  assert.match(result.detail, /1 models fetched/);
});

test("generic endpoint validation rejects bad keys and degrades gracefully", async () => {
  const setup = normalizeConnectionSetup(
    {
      provider: "unknown_fixture",
      api_key: "test-secret",
      endpoint_url: "https://api.example.com/v1",
    },
    app("unknown_fixture"),
  );
  await assert.rejects(
    validateConnectionCredential(setup, async () => new Response(null, { status: 401 })),
    /HTTP 401/,
  );
  const unreachable = await validateConnectionCredential(
    setup,
    async () => new Response(null, { status: 500 }),
  );
  assert.equal(unreachable.verified, false);
  const noCatalog = await validateConnectionCredential(setup, async () =>
    Response.json({ object: "list" }),
  );
  assert.equal(noCatalog.verified, false);
});

test("Claude custom OpenAI-compatible endpoints validate with a bearer catalog probe", async () => {
  const setup = normalizeConnectionSetup(
    { provider: "anthropic", api_key: "router-fixture-key", endpoint_url: "https://custom.example/v1" },
    app("anthropic"),
  );
  const result = await validateConnectionCredential(setup, async (url, init) => {
    assert.equal(String(url), "https://custom.example/v1/models");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer router-fixture-key");
    assert.equal(new Headers(init?.headers).get("x-api-key"), null);
    return Response.json({ data: [{ id: "anthropic/claude-sonnet-4" }] });
  });
  assert.equal(result.verified, true);
  assert.match(result.detail, /1 models fetched/);
  await assert.rejects(
    validateConnectionCredential(setup, async () => new Response(null, { status: 401 })),
    /HTTP 401/,
  );
});
