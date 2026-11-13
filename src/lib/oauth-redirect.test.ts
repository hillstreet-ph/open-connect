import test from "node:test";
import assert from "node:assert/strict";
import {
  isAcceptableRedirectUri,
  isLoopbackRedirectKey,
  redirectUriKey,
} from "./oauth-redirect.ts";

test("accepts https callbacks for web clients", () => {
  for (const uri of [
    "https://chatgpt.com/connector/oauth/abc",
    "https://client.example/callback?x=1",
  ])
    assert.equal(isAcceptableRedirectUri(uri), true);
  assert.equal(
    redirectUriKey("https://client.example/callback"),
    "https://client.example/callback",
  );
});

test("accepts http loopback callbacks and ignores the runtime-chosen port", () => {
  for (const uri of [
    "http://127.0.0.1:1455/callback",
    "http://localhost:8080/callback",
    "http://[::1]:9999/auth",
  ])
    assert.equal(isAcceptableRedirectUri(uri), true);
  assert.equal(redirectUriKey("http://127.0.0.1:1455/callback"), "loopback:127.0.0.1/callback");
  assert.equal(redirectUriKey("http://127.0.0.1:3000/callback"), "loopback:127.0.0.1/callback");
  assert.equal(redirectUriKey("http://localhost:8080/auth"), "loopback:localhost/auth");
  assert.equal(isLoopbackRedirectKey(redirectUriKey("http://localhost:8080/auth")), true);
});

test("rejects insecure, credentialed, fragmented and oversized callbacks", () => {
  for (const uri of [
    "http://evil.example/callback",
    "http://127.0.0.1.evil.example/callback",
    "http://192.168.1.10/callback",
    "https://user:pass@client.example/callback",
    "https://client.example/callback#frag",
    "javascript:alert(1)",
    "not a url",
    "",
    null,
    undefined,
    `https://client.example/${"a".repeat(2100)}`,
  ])
    assert.equal(isAcceptableRedirectUri(uri), false, String(uri));
});

test("distinguishes loopback paths so different callbacks do not collide", () => {
  assert.notEqual(
    redirectUriKey("http://127.0.0.1:1/callback"),
    redirectUriKey("http://127.0.0.1:2/other"),
  );
});
