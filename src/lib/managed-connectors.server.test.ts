import assert from "node:assert/strict";
import test from "node:test";
import {
  managedConnectorReady,
  connectionMethod,
  listOwnedManagedConnections,
  managedIdentityIds,
  createManagedConnectionLink,
  listComposioToolkits,
} from "./managed-connectors.server.ts";

test("identity aliases are scoped to one explicitly configured application user", () => {
  const original = process.env["COMPOSIO_USER_MAPPINGS"];
  try {
    process.env["COMPOSIO_USER_MAPPINGS"] = JSON.stringify({ owner: ["broker-owner"] });
    assert.deepEqual(managedIdentityIds("owner"), ["owner", "broker-owner"]);
    assert.deepEqual(managedIdentityIds("other"), ["other"]);
    process.env["COMPOSIO_USER_MAPPINGS"] = JSON.stringify({ owner: [null] });
    assert.throws(() => managedIdentityIds("owner"), /Invalid Composio user mapping/);
  } finally {
    if (original === undefined) delete process.env["COMPOSIO_USER_MAPPINGS"];
    else process.env["COMPOSIO_USER_MAPPINGS"] = original;
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
    process.env["COMPOSIO_AUTH_CONFIGS"] = JSON.stringify({ slack: "ac_slack" });
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
    return new Response(JSON.stringify({ redirect_url: "https://auth.example.test/", connected_account_id: "ca_dynamic", expires_at: "2026-01-01T00:00:00Z" }), { status: 200 });
  };
  try {
    const link = await createManagedConnectionLink({ provider: "dynamic_app", toolkitSlug: "dynamic_app", userId: "user-a", callbackUrl: "https://open-connect.site/connections" });
    assert.equal(link.connected_account_id, "ca_dynamic");
    assert.equal(calls[0].method, "GET");
    assert.equal(calls[1].method, "POST");
    assert.deepEqual(calls[1].body, { toolkit: { slug: "dynamic_app" }, auth_config: { type: "use_composio_managed_auth" } });
    assert.equal((calls[2].body as { auth_config_id?: string }).auth_config_id, "ac_dynamic");
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
    const items = calls === 1
      ? [{ slug: "sample_oauth", name: "Sample OAuth", categories: [{ name: "productivity" }], composio_managed_auth_schemes: ["OAUTH2", "API_KEY"] }]
      : [{ slug: "sample_key", name: "Sample Key", categories: ["data"], auth_schemes: ["API_KEY"] }];
    return new Response(JSON.stringify({ items, next_cursor: calls === 1 ? "next" : null }), { status: 200 });
  };
  try {
    const toolkits = await listComposioToolkits();
    assert.deepEqual(toolkits.map(({ slug }) => slug), ["sample_oauth", "sample_key"]);
    assert.deepEqual(toolkits[0].authMethods, ["OAUTH2", "API_KEY"]);
    assert.equal(toolkits[0].category, "Productivity");
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env["COMPOSIO_API_KEY"];
    else process.env["COMPOSIO_API_KEY"] = originalKey;
  }
});
