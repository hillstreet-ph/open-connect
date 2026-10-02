import assert from "node:assert/strict";
import test from "node:test";
import {
  managedConnectorReady,
  connectionMethod,
  listOwnedManagedConnections,
} from "./managed-connectors.server.ts";

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
