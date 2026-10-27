import assert from "node:assert/strict";
import test from "node:test";
import { detectPasswordCsv, mapPasswordCsvRow } from "./password-csv-mapping.ts";

test("detects browser, Bitwarden and Proton headers without exposing values", () => {
  assert.equal(detectPasswordCsv(["name", "url", "username", "password"]), "browser");
  assert.equal(detectPasswordCsv(["type", "name", "login_uri", "login_username", "login_password"]), "bitwarden");
  assert.equal(detectPasswordCsv(["type", "name", "url", "email", "password", "vault"]), "proton");
  assert.equal(detectPasswordCsv(["Title", "Website", "Username", "Password"]), "1password");
  assert.equal(detectPasswordCsv(["URL", "url", "username", "password"]), "unknown");
});

test("maps browser and Bitwarden logins with optional standard TOTP", () => {
  const browser = mapPasswordCsvRow(
    ["name", "url", "username", "password"],
    ["Example", "https://example.com", "alice", " fixture password "],
  );
  assert.equal(browser.status, "ready");
  if (browser.status === "ready") assert.equal(browser.value.secret_value, " fixture password ");
  const bitwarden = mapPasswordCsvRow(
    ["type", "name", "login_uri", "login_username", "login_password", "login_totp"],
    ["login", "Example", "https://example.com", "alice", "fixture", "JBSWY3DPEHPK3PXP"],
  );
  assert.equal(bitwarden.status, "ready");
  if (bitwarden.status === "ready") assert.equal(bitwarden.value.totp_secret, "JBSWY3DPEHPK3PXP");
  const onePassword = mapPasswordCsvRow(
    ["Title", "Website", "Username", "Password", "One-time password"],
    ["Example", "https://example.com", "alice", "fixture", "JBSWY3DPEHPK3PXP"],
  );
  assert.equal(onePassword.status, "ready");
  if (onePassword.status === "ready")
    assert.equal(onePassword.value.totp_secret, "JBSWY3DPEHPK3PXP");
});

test("flags fields and malformed records without leaking their contents", () => {
  const item = mapPasswordCsvRow(
    ["type", "name", "login_uri", "login_username", "login_password", "fields"],
    ["login", "Example", "https://example.com", "private-user", "private-password", "private-field"],
  );
  assert.equal(item.status, "review");
  assert.doesNotMatch(JSON.stringify(item), /private/);
  assert.equal(mapPasswordCsvRow(["url", "username", "password"], ["a"]).status, "review");
  assert.equal(
    mapPasswordCsvRow(
      ["name", "url", "username", "password", "extra"],
      ["Example", "https://example.com", "user", "secret", "unmapped"],
    ).status,
    "review",
  );
});
