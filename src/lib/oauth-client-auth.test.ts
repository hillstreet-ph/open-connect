import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveClientAuth } from "./oauth-client-auth.ts";
import { parseRedirectUriList, validateIntegrationInput } from "./oauth-integrations.ts";

const basic = (id: string, secret: string) =>
  "Basic " +
  Buffer.from(`${encodeURIComponent(id)}:${encodeURIComponent(secret)}`).toString("base64");

test("public PKCE clients authenticate with client_id only", () => {
  assert.deepEqual(resolveClientAuth(null, { client_id: "oc_cli_a" }), {
    ok: true,
    clientId: "oc_cli_a",
    clientSecret: null,
  });
});

test("client_secret_post passes the body secret", () => {
  assert.deepEqual(resolveClientAuth(null, { client_id: "oc_cli_a", client_secret: "s3" }), {
    ok: true,
    clientId: "oc_cli_a",
    clientSecret: "s3",
  });
});

test("client_secret_basic decodes form-encoded credentials", () => {
  assert.deepEqual(resolveClientAuth(basic("oc_cli_a", "se:c+ret"), {}), {
    ok: true,
    clientId: "oc_cli_a",
    clientSecret: "se:c+ret",
  });
  assert.equal(resolveClientAuth(basic("oc_cli_a", "x"), { client_id: "oc_cli_a" }).ok, true);
});

test("conflicting or malformed client credentials are rejected", () => {
  assert.deepEqual(resolveClientAuth(basic("oc_cli_a", "x"), { client_id: "oc_cli_b" }), {
    ok: false,
    error: "invalid_request",
  });
  assert.deepEqual(resolveClientAuth(basic("oc_cli_a", "x"), { client_secret: "y" }), {
    ok: false,
    error: "invalid_request",
  });
  assert.deepEqual(resolveClientAuth("Basic " + Buffer.from("nocolon").toString("base64"), {}), {
    ok: false,
    error: "invalid_client",
  });
  assert.deepEqual(resolveClientAuth(basic("oc_cli_a", ""), {}), {
    ok: false,
    error: "invalid_client",
  });
  assert.deepEqual(resolveClientAuth(null, {}), { ok: false, error: "invalid_request" });
});

test("redirect URL list parsing and validation", () => {
  assert.deepEqual(
    parseRedirectUriList(" https://a.test/cb \n\nhttps://a.test/cb, http://127.0.0.1/cb "),
    ["https://a.test/cb", "http://127.0.0.1/cb"],
  );
  assert.deepEqual(
    validateIntegrationInput({ name: " App ", redirect_uris: ["https://a.test/cb"] }),
    {
      name: "App",
      redirect_uris: ["https://a.test/cb"],
    },
  );
  assert.throws(() => validateIntegrationInput({ name: "", redirect_uris: ["https://a.test/cb"] }));
  assert.throws(() => validateIntegrationInput({ name: "A", redirect_uris: [] }));
  assert.throws(() =>
    validateIntegrationInput({ name: "A", redirect_uris: ["http://evil.test/cb"] }),
  );
  assert.throws(() =>
    validateIntegrationInput({ name: "A", redirect_uris: ["https://u:p@a.test/cb"] }),
  );
});
