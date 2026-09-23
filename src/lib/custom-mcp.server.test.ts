import assert from "node:assert/strict";
import test from "node:test";
import { connectionAuthHeaders } from "./custom-mcp.server.ts";

test("creates only the configured Custom MCP authentication header", () => {
  assert.deepEqual(connectionAuthHeaders("none", ""), {});
  assert.deepEqual(connectionAuthHeaders("bearer", "secret"), { Authorization: "Bearer secret" });
  assert.deepEqual(connectionAuthHeaders("api_key", "secret"), { "X-API-Key": "secret" });
});
