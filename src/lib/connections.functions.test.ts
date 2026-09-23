import assert from "node:assert/strict";
import test from "node:test";
import { normalizeConnectionSetup, type ConnectionSetupApp } from "./connection-setup.ts";

const app = (provider: string, oauth = false): ConnectionSetupApp => ({
  provider,
  display_name: provider,
  scopes: ["test"],
  oauth,
});

test("normalizes a custom HTTPS MCP connection", () => {
  const setup = normalizeConnectionSetup(
    {
      provider: "custom_mcp",
      display_name: "Operations MCP",
      account_label: "Production",
      endpoint_url: "https://mcp.example.com/mcp",
      api_key: "secret-token",
      auth_type: "bearer",
    },
    app("custom_mcp"),
  );

  assert.equal(setup.provider, "custom_mcp");
  assert.equal(setup.endpointUrl, "https://mcp.example.com/mcp");
  assert.equal(setup.apiKey, "secret-token");
});

test("rejects an insecure remote MCP endpoint", () => {
  assert.throws(
    () =>
      normalizeConnectionSetup(
        {
          provider: "custom_mcp",
          endpoint_url: "http://mcp.example.com/mcp",
          api_key: "secret-token",
        },
        app("custom_mcp"),
      ),
    /must use HTTPS/,
  );
});

test("accepts an AI provider key with its HTTPS endpoint", () => {
  const setup = normalizeConnectionSetup(
    {
      provider: "anthropic",
      endpoint_url: "https://api.anthropic.com",
      api_key: "sk-ant-example",
    },
    app("anthropic"),
  );

  assert.equal(setup.provider, "anthropic");
  assert.equal(setup.endpointUrl, "https://api.anthropic.com/");
});
