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
  const result = await validateConnectionCredential(setup, async () =>
    Response.json({ jsonrpc: "2.0", id: 1, result: { serverInfo: { name: "fixture" } } }),
  );
  assert.equal(result.verified, true);
  assert.equal(result.accountId, "fixture");
});

test("does not mark unsupported provider validation as verified", async () => {
  const setup = normalizeConnectionSetup(
    { provider: "proton_pass", api_key: "test-secret" },
    app("proton_pass"),
  );
  const result = await validateConnectionCredential(setup);
  assert.equal(result.verified, false);
});
