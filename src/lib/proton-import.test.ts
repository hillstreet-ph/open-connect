import assert from "node:assert/strict";
import test from "node:test";
import { mapProtonLogin, protonTotpSeed } from "./proton-import.ts";

const fixture = {
  type: "login",
  name: "Example",
  url: "https://example.com/login",
  email: "person@example.com",
  username: "person",
  password: " synthetic password ",
};

test("maps Proton login and standard TOTP without changing password whitespace", () => {
  const item = mapProtonLogin({
    ...fixture,
    totp: "otpauth://totp/example?secret=JBSWY3DPEHPK3PXP&algorithm=SHA1&digits=6&period=30",
  });
  assert.equal(item.status, "ready");
  if (item.status === "ready") {
    assert.equal(item.value.secret_value, " synthetic password ");
    assert.equal(item.value.totp_secret, "JBSWY3DPEHPK3PXP");
    assert.equal(item.value.email_address, "person@example.com");
    assert.equal(item.value.username, "person");
  }
});

test("rejects unsupported OTP parameters and ambiguous secrets", () => {
  for (const value of [
    "otpauth://hotp/x?secret=JBSWY3DPEHPK3PXP",
    "otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&digits=8",
    "otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&algorithm=SHA256",
    "otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&period=60",
    "otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&secret=JBSWY3DPEHPK3PXP",
    "JBSW!3DPEHPK3PXP",
  ]) assert.equal(protonTotpSeed(value), null);
});

test("unsupported data and malformed URLs cannot become importable or echo secrets", () => {
  for (const change of [
    { type: "creditCard" },
    { url: "https://example.com, https://other.example" },
    { url: "https://user:private@example.com/" },
    { url: "https://example.com/?token=private" },
    { url: "http://example.com/" },
    { note: "sensitive note" },
    { autofillUrls: '[{"url":"https://example.com"}]' },
    { totp: "private!2fa fixture" },
  ]) {
    const item = mapProtonLogin({ ...fixture, ...change });
    assert.equal(item.status, "review");
    assert.doesNotMatch(JSON.stringify(item), /synthetic password|private|sensitive note/);
  }
});
