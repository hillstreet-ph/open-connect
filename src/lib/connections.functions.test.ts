import assert from "node:assert/strict";
import test from "node:test";
import { normalizeConnectionSetup, type ConnectionSetupApp } from "./connection-setup.ts";
import { AI_GATEWAY_PROVIDERS } from "./ai-gateway-providers.ts";

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

test("allows a public custom MCP endpoint without a stored credential", () => {
  const setup = normalizeConnectionSetup(
    {
      provider: "custom_mcp",
      endpoint_url: "https://mcp.example.com/mcp",
      api_key: "",
      auth_type: "none",
    },
    app("custom_mcp"),
  );
  assert.equal(setup.authType, "none");
  assert.equal(setup.apiKey, "");
});

test("rejects insecure localhost MCP endpoints because execution requires HTTPS", () => {
  assert.throws(
    () =>
      normalizeConnectionSetup(
        {
          provider: "custom_mcp",
          endpoint_url: "http://localhost:3000/mcp",
          api_key: "",
          auth_type: "none",
        },
        app("custom_mcp"),
      ),
    /must use HTTPS/,
  );
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

test("rejects private-network MCP endpoints", () => {
  assert.throws(
    () =>
      normalizeConnectionSetup(
        {
          provider: "custom_mcp",
          endpoint_url: "https://192.168.1.20/mcp",
          api_key: "secret-token",
        },
        app("custom_mcp"),
      ),
    /private network/,
  );
  assert.throws(
    () =>
      normalizeConnectionSetup(
        {
          provider: "custom_mcp",
          endpoint_url: "https://[::1]/mcp",
          api_key: "",
          auth_type: "none",
        },
        app("custom_mcp"),
      ),
    /private network/,
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

test("AI Gateway providers accept provider API credentials through the gateway registry", () => {
  for (const provider of AI_GATEWAY_PROVIDERS) {
    const setup = normalizeConnectionSetup(
      {
        provider: provider.id,
        endpoint_url: provider.baseUrl,
        api_key: "provider-secret-for-test",
        auth_type: "api_key",
      },
      {
        provider: provider.id,
        display_name: provider.name,
        scopes: [],
        oauth: false,
      },
    );

    assert.equal(setup.provider, provider.id);
    assert.equal(new URL(setup.endpointUrl).protocol, "https:");
  }
});
