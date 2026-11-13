import assert from "node:assert/strict";
import { test } from "node:test";
import {
  manualAuthorizationServerMetadata,
  OAUTH_APP_PRESETS,
  OUTBOUND_OAUTH_REDIRECT_URL,
} from "./oauth-app-presets.ts";

test("presets point at HTTPS provider endpoints and a registration page", () => {
  assert.equal(OUTBOUND_OAUTH_REDIRECT_URL, "https://open-connect.site/custom-oauth-callback");
  for (const preset of OAUTH_APP_PRESETS) {
    assert.match(preset.registerUrl, /^https:\/\//);
    assert.ok(preset.issuer || (preset.authorizationEndpoint && preset.tokenEndpoint), preset.id);
  }
  const airtable = OAUTH_APP_PRESETS.find((p) => p.id === "airtable")!;
  assert.equal(airtable.registerUrl, "https://airtable.com/create/oauth");
});

test("manual metadata is built for providers without discovery", () => {
  const m = manualAuthorizationServerMetadata({
    authorization_endpoint: "https://airtable.com/oauth2/v1/authorize",
    token_endpoint: "https://airtable.com/oauth2/v1/token",
    scope: "data.records:read  schema.bases:read",
  });
  assert.equal(m.issuer, "https://airtable.com");
  assert.deepEqual(m.code_challenge_methods_supported, ["S256"]);
  assert.deepEqual(m.token_endpoint_auth_methods_supported, ["client_secret_basic"]);
  assert.deepEqual(m.scopes_supported, ["data.records:read", "schema.bases:read"]);
  assert.deepEqual(
    manualAuthorizationServerMetadata({
      authorization_endpoint: "https://auth.example.com/authorize",
      token_endpoint: "https://api.example.com/token",
      token_auth_method: "client_secret_post",
    }).token_endpoint_auth_methods_supported,
    ["client_secret_post"],
  );
});

test("manual metadata rejects unsafe or mismatched endpoints", () => {
  const ok = "https://airtable.com/oauth2/v1/authorize";
  for (const [authorize, token] of [
    ["http://airtable.com/a", "https://airtable.com/t"],
    [ok, "https://user:pw@airtable.com/t"],
    [ok, "https://evil.test/token"],
    ["not a url", "https://airtable.com/t"],
  ] as [string, string][])
    assert.throws(() =>
      manualAuthorizationServerMetadata({
        authorization_endpoint: authorize,
        token_endpoint: token,
      }),
    );
  assert.throws(() =>
    manualAuthorizationServerMetadata({
      authorization_endpoint: ok,
      token_endpoint: "https://airtable.com/oauth2/v1/token",
      token_auth_method: "private_key_jwt" as never,
    }),
  );
});
