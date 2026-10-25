import assert from "node:assert/strict";
import test from "node:test";
import {
  discoverOwnedConnectionTools,
  assertToolConnectionAccess,
  authorizeToolForConnectionSnapshot,
  connectionAuthHeaders,
  CredentialResolutionError,
  isMissingConnectionCredentialRpcError,
  isRemoteMcpProvider,
  remoteMcpCredentialFailureCode,
  remoteMcpFailureResult,
  RemoteMcpDiscoveryError,
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

test("remote MCP discovery failures expose only stable safe diagnostics", () => {
  const fixtures = [
    ["connection_metadata_invalid", false],
    ["connection_credential_unavailable", false],
    ["credential_broker_unavailable", true],
    ["remote_mcp_catalog_invalid", false],
    ["remote_mcp_unavailable", true],
  ] as const;

  for (const [code, retryable] of fixtures) {
    const result = remoteMcpFailureResult(new RemoteMcpDiscoveryError(code));
    assert.equal(result?.code, code);
    assert.equal(result?.retryable, retryable);
    assert.equal(result?.secrets_exposed, false);
    assert.doesNotMatch(JSON.stringify(result), /credential:\/\/|bearer|upstream-secret/i);
  }
});

test("credential discovery separates permanent configuration from transient broker failures", () => {
  assert.equal(
    remoteMcpCredentialFailureCode(new CredentialResolutionError("invalid_reference")),
    "connection_credential_unavailable",
  );
  assert.equal(
    remoteMcpCredentialFailureCode(new CredentialResolutionError("credential_missing")),
    "connection_credential_unavailable",
  );
  assert.equal(
    remoteMcpCredentialFailureCode(new CredentialResolutionError("broker_unavailable")),
    "credential_broker_unavailable",
  );
  assert.equal(
    remoteMcpCredentialFailureCode(new Error("temporary module or network failure")),
    "credential_broker_unavailable",
  );
});

test("credential discovery recognizes only the broker's stable missing-credential error", () => {
  const missingCredentialError = {
    code: "P0001",
    message: "connection credential not found",
    details: null,
    hint: null,
  };

  assert.equal(isMissingConnectionCredentialRpcError(missingCredentialError), true);
  assert.equal(
    remoteMcpCredentialFailureCode(new CredentialResolutionError("credential_missing")),
    "connection_credential_unavailable",
  );

  assert.equal(
    isMissingConnectionCredentialRpcError({
      ...missingCredentialError,
      message: "temporary broker failure",
    }),
    false,
  );
  assert.equal(
    isMissingConnectionCredentialRpcError({
      ...missingCredentialError,
      code: "08006",
    }),
    false,
  );
  assert.equal(isMissingConnectionCredentialRpcError(new Error("network failure")), false);
});

test("remote MCP discovery classifier preserves unrelated authorization errors", () => {
  assert.equal(remoteMcpFailureResult(new Error("Project access denied.")), null);
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

test("owner discovery retains disabled native tools and rejects foreign catalogs", async () => {
  const row = {
    id: "native",
    user_id: "owner",
    provider: "twilio",
    display_name: "Twilio",
    status: "connected",
    credential_reference: "credential://twilio/11111111-1111-4111-8111-111111111111",
    metadata: { disabled_tools: ["twilio_account"] },
    scopes: ["account:read"],
  };
  const tools = await discoverOwnedConnectionTools("owner", "native", async () => row);
  assert.ok(tools.some((tool) => tool["name"] === "twilio_account"));
  await assert.rejects(
    () => discoverOwnedConnectionTools("foreign", "native", async () => row),
    /Connection not found/,
  );
});
