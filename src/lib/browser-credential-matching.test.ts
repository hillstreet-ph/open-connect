import assert from "node:assert/strict";
import test from "node:test";
import { matchBrowserCredentials } from "./browser-credential-matching.ts";

const record = {
  id: "owned-id",
  name: "Site login",
  website: "https://example.com/login",
  username: "Owner",
  email_address: "owner@example.com",
  vault_secret_id: "opaque-vault-id",
  totp_vault_secret_id: "opaque-totp-id",
  secret_value: "never-return-this",
  totp_seed: "never-return-this-either",
};
test("matches exact HTTPS origins and exposes availability without values or vault IDs", () => {
  const result = matchBrowserCredentials([record], "https://example.com", "OWNER@example.com");
  assert.equal(result.status, "matched");
  assert.equal(result.matches[0]?.has_totp, true);
  assert.equal(result.sign_in_performed, false);
  assert.equal(result.secure_injection_available, false);
  assert.doesNotMatch(JSON.stringify(result), /never-return|opaque-vault|opaque-totp/);
});
test("does not match parent, sibling, suffix-lookalike hosts, HTTP or different ports", () => {
  for (const website of [
    "https://login.example.com",
    "https://example.com.evil.test",
    "http://example.com",
    "https://example.com:8443",
    "https://user:password@example.com",
  ])
    assert.equal(
      matchBrowserCredentials([{ ...record, website }], "https://example.com").status,
      "no_match",
    );
  assert.equal(
    matchBrowserCredentials([{ ...record, vault_secret_id: null }], "https://example.com").status,
    "no_match",
  );
});
test("ambiguous accounts require selection, and usernames are exact", () => {
  const other = { ...record, id: "other", username: "Other", email_address: "other@example.com" };
  const result = matchBrowserCredentials([record, other], "https://example.com");
  assert.equal(result.status, "ambiguous");
  assert.equal(result.selected_credential_id, null);
  assert.equal(
    matchBrowserCredentials([record, other], "https://example.com", "Owner").selected_credential_id,
    record.id,
  );
  assert.equal(
    matchBrowserCredentials([record], "https://example.com", "owner").status,
    "no_match",
  );
});
test("rejects unsafe or invalid destination inputs without echoing them", () => {
  for (const input of [
    undefined,
    "http://example.com",
    "https://example.com/login",
    "https://example.com?secret=value",
    "https://example.com#code",
    "https://user:password@example.com",
  ])
    assert.throws(() => matchBrowserCredentials([record], input), /HTTPS origin/);
  assert.throws(() => matchBrowserCredentials([record], "https://example.com", {}), /Account/);
});
