import test from "node:test";
import assert from "node:assert/strict";
import {
  authenticatedProfile,
  MCP_RESOURCE,
  oauthCallback,
  oauthResource,
  resourceAllowsRequest,
} from "./mcp-oauth-contract.ts";

test("OAuth resource is exact, defaults canonically, and rejects malformed/multiple audiences", () => {
  assert.equal(oauthResource(undefined), MCP_RESOURCE);
  assert.equal(oauthResource(MCP_RESOURCE), MCP_RESOURCE);
  for (const value of [
    null,
    [],
    [MCP_RESOURCE],
    "https://other.example/mcp",
    MCP_RESOURCE + "/",
    "https://open-connect.site",
  ])
    assert.throws(() => oauthResource(value), /resource/);
});
test("resource-bound tokens cannot cross to models, APIs or other hosts", () => {
  assert.equal(resourceAllowsRequest(MCP_RESOURCE, MCP_RESOURCE), true);
  for (const url of [
    "https://open-connect.site/v1",
    "https://open-connect.site/api/v1",
    "https://evil.example/mcp",
  ])
    assert.equal(resourceAllowsRequest(MCP_RESOURCE, url), false);
  assert.equal(resourceAllowsRequest(null, "https://open-connect.site/v1"), true);
  assert.equal(resourceAllowsRequest("invalid", MCP_RESOURCE), false);
});
test("success and denial callbacks identify the same issuer and preserve client state", () => {
  for (const result of [{ code: "one-time" }, { error: "access_denied" }] as const) {
    const url = new URL(
      oauthCallback(
        "https://client.example/callback?code=stale&error=stale&state=stale",
        "client-state",
        result,
      ),
    );
    assert.equal(url.searchParams.get("iss"), "https://open-connect.site");
    assert.equal(url.searchParams.get("state"), "client-state");
    assert.equal(url.searchParams.has("code"), "code" in result);
    assert.equal(url.searchParams.has("error"), "error" in result);
  }
});
test("native loopback callbacks are built for the client's own port", () => {
  const url = new URL(
    oauthCallback("http://127.0.0.1:1455/callback", "s", { code: "one-time" }),
  );
  assert.equal(url.origin, "http://127.0.0.1:1455");
  assert.equal(url.searchParams.get("code"), "one-time");
  assert.equal(url.searchParams.get("iss"), "https://open-connect.site");
  for (const redirectUri of ["http://evil.example/callback", "https://client.example/cb#x"])
    assert.throws(() => oauthCallback(redirectUri, "s", { code: "x" }), /Invalid OAuth callback/);
});
test("profile identity is immutable account identity, never display data or a per-token value", () => {
  const id = "8ac5543f-9c9e-4807-9a15-5f1bcc65a9bf";
  assert.deepEqual(authenticatedProfile(id), { id });
  assert.deepEqual(authenticatedProfile(id), authenticatedProfile(id));
  assert.notEqual(authenticatedProfile("other-account").id, id);
  for (const value of [undefined, null, "", "  "]) assert.throws(() => authenticatedProfile(value));
});
