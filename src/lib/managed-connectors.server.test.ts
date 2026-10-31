import assert from "node:assert/strict";
import test from "node:test";
import {
  managedConnectorReady,
  connectionMethod,
  listOwnedManagedConnections,
  listOwnedManagedConnectionsForIdentity,
  managedIdentityIds,
  createManagedConnectionLink,
  listComposioToolkits,
  getManagedAccountIdentity,
  listManagedTools,
} from "./managed-connectors.server.ts";

test("identity aliases are scoped to one explicitly configured application user", () => {
  const original = process.env["COMPOSIO_USER_MAPPINGS"];
  try {
    process.env["COMPOSIO_USER_MAPPINGS"] = JSON.stringify({
      owner: ["broker-owner"],
    });
    assert.deepEqual(managedIdentityIds("owner"), ["owner", "broker-owner"]);
    assert.deepEqual(managedIdentityIds("other"), ["other"]);
    process.env["COMPOSIO_USER_MAPPINGS"] = JSON.stringify({ owner: [null] });
    assert.throws(() => managedIdentityIds("owner"), /Invalid Composio user mapping/);
  } finally {
    if (original === undefined) delete process.env["COMPOSIO_USER_MAPPINGS"];
    else process.env["COMPOSIO_USER_MAPPINGS"] = original;
  }
});

test("account-specific reads reject identities outside the configured user mapping", async () => {
  const original = process.env["COMPOSIO_USER_MAPPINGS"];
  const originalKey = process.env["COMPOSIO_API_KEY"];
  try {
    process.env["COMPOSIO_USER_MAPPINGS"] = JSON.stringify({
      owner: ["apify_sequin-mainan"],
    });
    process.env["COMPOSIO_API_KEY"] = "test-key";
    await assert.rejects(
      listOwnedManagedConnectionsForIdentity("owner", "another-account"),
      /not configured for this user/,
    );
  } finally {
    if (original === undefined) delete process.env["COMPOSIO_USER_MAPPINGS"];
    else process.env["COMPOSIO_USER_MAPPINGS"] = original;
    if (originalKey === undefined) delete process.env["COMPOSIO_API_KEY"];
    else process.env["COMPOSIO_API_KEY"] = originalKey;
  }
});

test("managed connectors require both a broker key and provider auth config", () => {
  const originalKey = process.env["COMPOSIO_API_KEY"];
  const originalConfigs = process.env["COMPOSIO_AUTH_CONFIGS"];
  try {
    delete process.env["COMPOSIO_API_KEY"];
    delete process.env["COMPOSIO_AUTH_CONFIGS"];
    assert.equal(managedConnectorReady("slack"), false);

    process.env["COMPOSIO_API_KEY"] = "test-key";
    process.env["COMPOSIO_AUTH_CONFIGS"] = JSON.stringify({
      slack: "ac_slack",
    });
    assert.equal(managedConnectorReady("slack"), true);
    assert.equal(managedConnectorReady("github"), false);
  } finally {
    if (originalKey === undefined) delete process.env["COMPOSIO_API_KEY"];
    else process.env["COMPOSIO_API_KEY"] = originalKey;
    if (originalConfigs === undefined) delete process.env["COMPOSIO_AUTH_CONFIGS"];
    else process.env["COMPOSIO_AUTH_CONFIGS"] = originalConfigs;
  }
});

test("invalid broker configuration never enables a connector", () => {
  const original = process.env["COMPOSIO_AUTH_CONFIGS"];
  try {
    process.env["COMPOSIO_API_KEY"] = "test-key";
    process.env["COMPOSIO_AUTH_CONFIGS"] = "not-json";
    assert.equal(managedConnectorReady("gmail"), false);
  } finally {
    if (original === undefined) delete process.env["COMPOSIO_AUTH_CONFIGS"];
    else process.env["COMPOSIO_AUTH_CONFIGS"] = original;
    delete process.env["COMPOSIO_API_KEY"];
  }
});

test("configured broker supports native OAuth and API-key catalog providers", () => {
  assert.equal(connectionMethod("github", true, true), "managed_oauth");
  assert.equal(connectionMethod("supabase", false, true), "managed_oauth");
  assert.equal(connectionMethod("cloudflare", false, true), "managed_oauth");
  assert.equal(connectionMethod("github", true, false), "native_oauth");
  assert.equal(connectionMethod("supabase", false, false), "api_key");
  assert.equal(connectionMethod("gmail", true, false), "managed_oauth");
});

test("account sync filters ownership, config, and status and deduplicates pages", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env["COMPOSIO_API_KEY"];
  const originalConfigs = process.env["COMPOSIO_AUTH_CONFIGS"];
  process.env["COMPOSIO_API_KEY"] = "test-key";
  process.env["COMPOSIO_AUTH_CONFIGS"] = JSON.stringify({ gmail: "ac_gmail" });
  let calls = 0;
  const good = {
    id: "ca_owned",
    user_id: "user-a",
    status: "ACTIVE",
    auth_config: { id: "ac_gmail" },
  };
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get("user_ids"), "user-a");
    calls++;
    return new Response(
      JSON.stringify({
        items:
          calls === 1
            ? [
                good,
                { ...good, id: "ca_other", user_id: "user-b" },
                { ...good, id: "ca_pending", status: "INITIATED" },
                { ...good, id: "ca_disabled", is_disabled: true },
                { ...good, id: "ca_unknown", auth_config: { id: "ac_other" } },
              ]
            : [good],
        next_cursor: calls === 1 ? "next-page" : null,
      }),
      { status: 200 },
    );
  };
  try {
    assert.deepEqual(await listOwnedManagedConnections("user-a"), [
      { id: "ca_owned", provider: "gmail" },
    ]);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env["COMPOSIO_API_KEY"];
    else process.env["COMPOSIO_API_KEY"] = originalKey;
    if (originalConfigs === undefined) delete process.env["COMPOSIO_AUTH_CONFIGS"];
    else process.env["COMPOSIO_AUTH_CONFIGS"] = originalConfigs;
  }
});

test("managed toolkit authorization is created on demand and reused by the connection link", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env["COMPOSIO_API_KEY"];
  const originalConfigs = process.env["COMPOSIO_AUTH_CONFIGS"];
  process.env["COMPOSIO_API_KEY"] = "test-key";
  delete process.env["COMPOSIO_AUTH_CONFIGS"];
  const calls: Array<{ path: string; method: string; body?: unknown }> = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ path: url.pathname + url.search, method, body });
    if (url.pathname.endsWith("/auth_configs") && method === "GET") {
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    }
    if (url.pathname.endsWith("/auth_configs") && method === "POST") {
      return new Response(JSON.stringify({ auth_config: { id: "ac_dynamic" } }), { status: 201 });
    }
    return new Response(
      JSON.stringify({
        redirect_url: "https://auth.example.test/",
        connected_account_id: "ca_dynamic",
        expires_at: "2026-01-01T00:00:00Z",
      }),
      { status: 200 },
    );
  };
  try {
    const link = await createManagedConnectionLink({
      provider: "dynamic_app",
      toolkitSlug: "dynamic_app",
      userId: "user-a",
      callbackUrl: "https://open-connect.site/connections",
    });
    assert.equal(link.connected_account_id, "ca_dynamic");
    assert.equal(calls[0]!.method, "GET");
    assert.equal(calls[1]!.method, "POST");
    assert.deepEqual(calls[1]!.body, {
      toolkit: { slug: "dynamic_app" },
      auth_config: { type: "use_composio_managed_auth" },
    });
    assert.equal((calls[2]!.body as { auth_config_id?: string }).auth_config_id, "ac_dynamic");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env["COMPOSIO_API_KEY"];
    else process.env["COMPOSIO_API_KEY"] = originalKey;
    if (originalConfigs === undefined) delete process.env["COMPOSIO_AUTH_CONFIGS"];
    else process.env["COMPOSIO_AUTH_CONFIGS"] = originalConfigs;
  }
});

test("custom MCP auth selection preserves overrides and fails closed on ambiguity", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env["COMPOSIO_API_KEY"];
  const originalConfigs = process.env["COMPOSIO_AUTH_CONFIGS"];
  const config = {
    id: "ac_custom",
    toolkit: { slug: "custom_example" },
    is_composio_managed: false,
    status: "ENABLED",
  };
  const input = {
    provider: "custom_example",
    toolkitSlug: "CUSTOM_EXAMPLE",
    userId: "user-a",
    callbackUrl: "https://open-connect.site/connections",
  };
  const cases = [
    {
      name: "unique config on later page",
      pages: [{ items: [], next_cursor: "next" }, { items: [config, config] }],
      expected: "ac_custom",
    },
    {
      name: "disabled, foreign, managed and malformed configs are excluded",
      pages: [
        {
          items: [
            config,
            { ...config, id: "ac_disabled", status: "DISABLED" },
            { ...config, id: "ac_foreign", toolkit: { slug: "custom_other" } },
            { ...config, id: "ac_managed", is_composio_managed: true },
            { ...config, id: "invalid" },
          ],
        },
      ],
      expected: "ac_custom",
    },
    {
      name: "missing custom config never creates managed auth",
      pages: [{ items: [] }],
      error: /No enabled custom auth config/,
    },
    {
      name: "ambiguity across pages requires explicit selection",
      pages: [{ items: [config], next_cursor: "next" }, { items: [{ ...config, id: "ac_other" }] }],
      error: /Multiple enabled custom auth configs/,
    },
    {
      name: "repeated pagination cursor fails closed",
      pages: [
        { items: [config], next_cursor: "repeat" },
        { items: [config], next_cursor: "repeat" },
      ],
      error: /pagination did not advance/,
    },
    {
      name: "explicit provider config retains priority",
      pages: [],
      override: "ac_selected",
      expected: "ac_selected",
    },
  ];
  try {
    process.env["COMPOSIO_API_KEY"] = "test-key";
    for (const scenario of cases) {
      await t.test(scenario.name, async () => {
        if (scenario.override) {
          process.env["COMPOSIO_AUTH_CONFIGS"] = JSON.stringify({
            custom_example: scenario.override,
          });
        } else {
          delete process.env["COMPOSIO_AUTH_CONFIGS"];
        }
        let reads = 0;
        let links = 0;
        globalThis.fetch = async (request, init) => {
          const url = new URL(String(request));
          if (url.pathname.endsWith("/auth_configs")) {
            assert.equal(
              init?.method ?? "GET",
              "GET",
              "custom auth must never be created automatically",
            );
            assert.equal(url.searchParams.get("toolkit_slug"), "CUSTOM_EXAMPLE");
            assert.equal(url.searchParams.get("is_composio_managed"), "false");
            assert.equal(url.searchParams.get("show_disabled"), "false");
            if (reads > 0)
              assert.equal(url.searchParams.get("cursor"), scenario.pages[reads - 1]!.next_cursor);
            assert.ok(reads < scenario.pages.length);
            return new Response(JSON.stringify(scenario.pages[reads++]));
          }
          assert.ok(url.pathname.endsWith("/connected_accounts/link"));
          assert.equal(init?.method, "POST");
          const body = JSON.parse(String(init?.body));
          assert.equal(body.auth_config_id, scenario.expected);
          assert.equal(body.user_id, "user-a");
          assert.equal(body.callback_url, input.callbackUrl);
          assert.deepEqual(body.experimental, { account_type: "PRIVATE" });
          links++;
          return new Response(JSON.stringify({ connected_account_id: "ca_custom" }));
        };
        if (scenario.error) {
          await assert.rejects(createManagedConnectionLink(input), scenario.error);
          assert.equal(links, 0);
        } else {
          assert.equal(
            (await createManagedConnectionLink(input)).connected_account_id,
            "ca_custom",
          );
          assert.equal(links, 1);
        }
        assert.equal(reads, scenario.pages.length);
      });
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env["COMPOSIO_API_KEY"];
    else process.env["COMPOSIO_API_KEY"] = originalKey;
    if (originalConfigs === undefined) delete process.env["COMPOSIO_AUTH_CONFIGS"];
    else process.env["COMPOSIO_AUTH_CONFIGS"] = originalConfigs;
  }
});

test("Composio toolkit discovery follows cursors and exposes supported auth methods", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env["COMPOSIO_API_KEY"];
  process.env["COMPOSIO_API_KEY"] = "test-key";
  let calls = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get("managed_by"), "all");
    calls++;
    const items =
      calls === 1
        ? [
            {
              slug: "sample_oauth",
              name: "Sample OAuth",
              categories: [{ name: "productivity" }],
              composio_managed_auth_schemes: ["OAUTH2", "API_KEY"],
              logo: "https://cdn.composio.dev/sample-oauth.svg",
            },
          ]
        : [
            {
              slug: "sample_key",
              name: "Sample Key",
              categories: ["data"],
              auth_schemes: ["API_KEY"],
              media: { logo: "https://cdn.composio.dev/sample-key.svg" },
            },
            {
              slug: "unsafe_logo",
              name: "Unsafe Logo",
              logo: "javascript:alert(1)",
            },
          ];
    return new Response(JSON.stringify({ items, next_cursor: calls === 1 ? "next" : null }), {
      status: 200,
    });
  };
  try {
    const toolkits = await listComposioToolkits();
    assert.deepEqual(
      toolkits.map(({ slug }) => slug),
      ["sample_oauth", "sample_key", "unsafe_logo"],
    );
    assert.deepEqual(toolkits[0]!.authMethods, ["OAUTH2", "API_KEY"]);
    assert.equal(toolkits[0]!.category, "Productivity");
    assert.equal(toolkits[0]!.logo, "https://cdn.composio.dev/sample-oauth.svg");
    assert.equal(toolkits[1]!.logo, "https://cdn.composio.dev/sample-key.svg");
    assert.equal(toolkits[2]!.logo, "");
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env["COMPOSIO_API_KEY"];
    else process.env["COMPOSIO_API_KEY"] = originalKey;
  }
});

test("profile discovery uses a fixed read-only endpoint and returns no credential fields", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env["COMPOSIO_API_KEY"];
  process.env["COMPOSIO_API_KEY"] = "test-key";
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls++;
    assert.equal(String(input), "https://backend.composio.dev/api/v3.1/tools/execute/proxy");
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body, {
      connected_account_id: "ca_selected",
      user_id: "owner",
      endpoint: "https://api.github.com/user",
      method: "GET",
    });
    return new Response(
      JSON.stringify({
        status: 200,
        data: {
          login: "operator",
          name: "Owner",
          email: "owner@example.com",
          access_token: "never-return",
        },
        headers: { authorization: "hidden" },
      }),
    );
  };
  try {
    assert.deepEqual(await getManagedAccountIdentity("github", "ca_selected", "owner"), {
      label: "",
      login: "operator",
      name: "Owner",
      email: "owner@example.com",
    });
    assert.equal(await getManagedAccountIdentity("unknown", "ca_selected", "owner"), null);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env["COMPOSIO_API_KEY"];
    else process.env["COMPOSIO_API_KEY"] = originalKey;
  }
});

test("TinyFish broker validates ownership and uses the verified external identity for proxy authentication", async () => {
  const oldKey = process.env["COMPOSIO_API_KEY"],
    oldMap = process.env["COMPOSIO_USER_MAPPINGS"],
    send = globalThis.fetch;
  const requests: Array<{ url: string; body: Record<string, unknown> | null }> = [];
  try {
    process.env["COMPOSIO_API_KEY"] = "test-broker-key";
    process.env["COMPOSIO_USER_MAPPINGS"] = JSON.stringify({ owner: ["verified-broker-owner"] });
    globalThis.fetch = (async (input, init) => {
      const url = String(input);
      requests.push({ url, body: typeof init?.body === "string" ? JSON.parse(init.body) : null });
      return Response.json(
        url.includes("/connected_accounts/")
          ? {
              id: "ca_tinyfish",
              user_id: "verified-broker-owner",
              status: "ACTIVE",
              toolkit: { slug: "tinyfish" },
            }
          : { status: 200, data: { profiles: [] } },
      );
    }) as typeof fetch;
    const { managedTinyFishClient } = await import("./managed-connectors.server.ts");
    const client = await managedTinyFishClient("owner", "ca_tinyfish");
    await client.listProfiles();
    assert.equal(requests.length, 2);
    assert.equal(requests[1]?.body?.["user_id"], "verified-broker-owner");
    assert.equal(requests[1]?.body?.["connected_account_id"], "ca_tinyfish");
    assert.ok(!JSON.stringify(requests).includes("X-API-Key"));
    requests.length = 0;
    await assert.rejects(managedTinyFishClient("other", "ca_tinyfish"), /owned by this user/);
    assert.equal(requests.length, 1);
  } finally {
    globalThis.fetch = send;
    if (oldKey === undefined) delete process.env["COMPOSIO_API_KEY"];
    else process.env["COMPOSIO_API_KEY"] = oldKey;
    if (oldMap === undefined) delete process.env["COMPOSIO_USER_MAPPINGS"];
    else process.env["COMPOSIO_USER_MAPPINGS"] = oldMap;
  }
});

test("tool discovery follows cursors, deduplicates tools, and shares concurrent catalog loads", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env["COMPOSIO_API_KEY"];
  process.env["COMPOSIO_API_KEY"] = "test-key";
  const seen: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    seen.push(url.searchParams.get("cursor") ?? "first");
    return Response.json(
      url.searchParams.has("cursor")
        ? { items: [{ slug: "A", description: "updated" }, { slug: "B" }], next_cursor: null }
        : { items: [{ slug: "A" }], next_cursor: "opaque+/=" },
    );
  }) as typeof fetch;
  try {
    const [first, second] = await Promise.all([
      listManagedTools("pagination-test"),
      listManagedTools("pagination-test"),
    ]);
    assert.deepEqual(seen, ["first", "opaque+/="]);
    assert.equal(first.hasMore, false);
    assert.deepEqual(
      first.tools.map((tool) => tool.name),
      ["A", "B"],
    );
    assert.equal(first.tools[0]?.description, "updated");
    assert.deepEqual(second, first);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env["COMPOSIO_API_KEY"];
    else process.env["COMPOSIO_API_KEY"] = originalKey;
  }
});

test("repeated tool cursors fail clearly and failed discovery can be retried", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env["COMPOSIO_API_KEY"];
  process.env["COMPOSIO_API_KEY"] = "test-key";
  globalThis.fetch = (async () =>
    Response.json({ items: [], next_cursor: "repeat" })) as typeof fetch;
  try {
    await assert.rejects(listManagedTools("cursor-loop-test"), /did not advance/);
    globalThis.fetch = (async () =>
      Response.json({ items: [{ slug: "RECOVERED" }] })) as typeof fetch;
    assert.equal((await listManagedTools("cursor-loop-test")).tools[0]?.name, "RECOVERED");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env["COMPOSIO_API_KEY"];
    else process.env["COMPOSIO_API_KEY"] = originalKey;
  }
});
