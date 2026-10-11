import assert from "node:assert/strict";
import test from "node:test";
import {
  assertToolConnectionAccess,
  authorizeToolForConnectionSnapshot,
  connectionAuthHeaders,
  isRemoteMcpProvider,
} from "./custom-mcp.server.ts";

test("creates only the configured Custom MCP authentication header", () => {
  assert.deepEqual(connectionAuthHeaders("none", ""), {});
  assert.deepEqual(connectionAuthHeaders("bearer", "secret"), { Authorization: "Bearer secret" });
  assert.deepEqual(connectionAuthHeaders("api_key", "secret"), { "X-API-Key": "secret" });
});

test("authorizes the tool against the same connection snapshot used for dispatch", () => {
  const connection = { id: "connection-1", display_name: "Native Twilio", provider: "twilio" };
  const tool = { name: "twilio_get_account", annotations: { readOnlyHint: true } };
  let authorizedProvider = "";

  const selected = authorizeToolForConnectionSnapshot(
    connection,
    [tool],
    "twilio_get_account",
    (snapshot) => {
      authorizedProvider = snapshot.provider;
    },
  );

  assert.equal(selected, tool);
  assert.equal(authorizedProvider, connection.provider);
});

test("existing Apify MCP provider uses the remote MCP adapter", () => {
  assert.equal(isRemoteMcpProvider("apify_mcp"), true);
  assert.equal(isRemoteMcpProvider("custom_mcp"), true);
  assert.equal(isRemoteMcpProvider("unknown_provider"), false);
});

test("Apify MCP enforces personal ownership and connected status", async () => {
  const connection = {
    id: "apify-existing",
    user_id: "owner",
    provider: "apify_mcp",
    status: "connected",
  };
  await assertToolConnectionAccess("owner", connection);
  await assert.rejects(
    () => assertToolConnectionAccess("other", connection),
    /Connection not found/,
  );
  await assert.rejects(
    () => assertToolConnectionAccess("owner", { ...connection, status: "disconnected" }),
    /not verified/,
  );
});

test("Apify MCP enforces project grants before execution", async () => {
  const connection = {
    id: "apify-existing",
    user_id: "owner",
    provider: "apify_mcp",
    status: "connected",
  };
  let checked = false;
  await assertToolConnectionAccess("member", connection, "project-1", async () => {
    checked = true;
  });
  assert.equal(checked, true);
  await assert.rejects(
    () =>
      assertToolConnectionAccess("member", connection, "project-1", async () => {
        throw new Error("Connection is not shared with this project.");
      }),
    /not shared/,
  );
});
