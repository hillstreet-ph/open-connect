import assert from "node:assert/strict";
import test from "node:test";
import { authorizeToolForConnectionSnapshot, connectionAuthHeaders } from "./custom-mcp.server.ts";

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
