import test from "node:test";
import assert from "node:assert/strict";
import {
  authForProtocol,
  connectionLogin,
  defaultConnectorAuth,
  connectionUsesBrowserLogin,
  connectionReconnectReady,
} from "./connection-login.ts";

test("OAuth is prioritized only when supported, ready and actually an OAuth flow", () => {
  const base = {
    provider: "app",
    display_name: "Example",
    oauth: true,
    oauth_ready: true,
    connection_method: "managed_oauth",
  };
  assert.equal(
    connectionLogin({ ...base, auth_methods: ["OAUTH2", "API_KEY"] }).label,
    "OAuth · recommended",
  );
  assert.equal(
    connectionLogin({ ...base, auth_methods: ["API_KEY"] }).label,
    "API/token · secure hosted setup",
  );
  assert.equal(
    connectionLogin({ ...base, oauth_ready: false, auth_methods: ["OAUTH2"] }).label,
    "OAuth · setup required",
  );
  assert.equal(
    connectionLogin({
      ...base,
      provider: "github",
      connection_method: "native_oauth",
      auth_methods: [],
    }).action,
    "Sign in with Example",
  );
  assert.equal(
    connectionLogin({ ...base, provider: "proton_pass" }).action,
    "Connect Proton executor",
  );
});

test("reconnect preserves the saved account method even if the catalog changes its preferred route", () => {
  assert.equal(
    connectionUsesBrowserLogin({ credential_reference: "composio://connected-account/account" }),
    true,
  );
  assert.equal(connectionUsesBrowserLogin({ metadata: { mode: "oauth" } }), true);
  assert.equal(connectionUsesBrowserLogin({ metadata: { auth_type: "oauth" } }), true);
  assert.equal(
    connectionUsesBrowserLogin({
      credential_reference: "credential://cloudflare/account",
      metadata: { mode: "brokered_secret", auth_type: "bearer" },
    }),
    false,
  );
  assert.equal(connectionUsesBrowserLogin({ metadata: { auth_type: "api_key" } }), false);
  assert.equal(connectionUsesBrowserLogin({ browser_login: true, metadata: {} }), true);
  assert.equal(connectionUsesBrowserLogin({ browser_login: false, metadata: {} }), false);
});
test("new MCP connections prefer OAuth while saved auth choices and API protocols remain valid", () => {
  assert.equal(defaultConnectorAuth("http"), "oauth");
  assert.equal(defaultConnectorAuth("sse"), "oauth");
  assert.equal(defaultConnectorAuth("openapi"), "bearer");
  for (const saved of ["none", "bearer", "api_key", "personal_access_token", "oauth"])
    assert.equal(defaultConnectorAuth("http", saved), saved);
  assert.equal(authForProtocol("openapi", "oauth"), "bearer");
  assert.equal(authForProtocol("openapi", "api_key"), "api_key");
  assert.equal(authForProtocol("http", "oauth"), "oauth");
});

test("custom MCP OAuth reconnect uses its own discovery instead of catalog OAuth configuration", () => {
  assert.equal(
    connectionReconnectReady({ provider: "custom_mcp", browser_login: true }, false),
    true,
  );
  assert.equal(
    connectionReconnectReady({ provider: "custom_api", browser_login: false }, false),
    true,
  );
  assert.equal(connectionReconnectReady({ provider: "github", browser_login: true }, false), false);
  assert.equal(
    connectionReconnectReady({ provider: "cloudflare", browser_login: false }, false),
    true,
  );
});
