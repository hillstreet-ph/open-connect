import test from "node:test";
import assert from "node:assert/strict";
import { safeOAuthReturn, validateOAuthRequest } from "./oauth-policy.ts";
const req = {
  response_type: "code",
  client_id: "test",
  redirect_uri: "https://chatgpt.com/connector/oauth/test",
  code_challenge: "a".repeat(43),
  code_challenge_method: "S256",
};
test("retains local consent return and blocks external redirects", () => {
  assert.equal(safeOAuthReturn("/oauth/authorize?state=x"), "/oauth/authorize?state=x");
  for (const s of ["//evil.test", "https://evil.test", "/\\evil.test", "/dashboard"])
    assert.equal(safeOAuthReturn(s), "/dashboard");
});
test("requires code and S256, rejects unsupported scopes and unsafe callbacks", () => {
  for (const p of [
    { response_type: "token" },
    { code_challenge_method: "plain" },
    { code_challenge: "x" },
    { scope: "admin:*" },
    { redirect_uri: "javascript:alert(1)" },
  ])
    assert.throws(() => validateOAuthRequest({ ...req, ...p }));
});
test("preserves requested scopes without adding write permissions", () => {
  assert.equal(
    validateOAuthRequest({ ...req, scope: "mcp:connect resources:read" }).scope,
    "mcp:connect resources:read",
  );
  assert.equal(validateOAuthRequest(req).scope, "mcp:connect resources:read connections:read");
});

test("static discovery advertises only implemented OAuth grants", async () => {
  const { readFile } = await import("node:fs/promises");
  const metadata = JSON.parse(
    await readFile(
      new URL("../../public/.well-known/oauth-authorization-server", import.meta.url),
      "utf8",
    ),
  );
  assert.deepEqual(metadata.grant_types_supported, ["authorization_code"]);
  assert.deepEqual(metadata.token_endpoint_auth_methods_supported, ["none"]);
  assert.equal(metadata.logo_uri, "https://open-connect.site/open-connect-mark.png");
});
