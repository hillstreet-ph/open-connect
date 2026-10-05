import assert from "node:assert/strict";
import test from "node:test";
import { verifySchedulerOidc } from "./github-actions-oidc.ts";

function encode(value: unknown) {
  return btoa(JSON.stringify(value)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

test("scheduler OIDC accepts only correctly signed main-branch runner identity", async () => {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const jwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid: "test-key" };
  const header = encode({ alg: "RS256", kid: "test-key" });
  const claims = encode({
    iss: "https://token.actions.githubusercontent.com",
    aud: "open-connect-scheduler",
    exp: 2000,
    iat: 1000,
    repository: "hillstreet-ph/open-connect",
    ref: "refs/heads/main",
    workflow_ref:
      "hillstreet-ph/open-connect/.github/workflows/scheduler-runner.yml@refs/heads/main",
  });
  const input = new TextEncoder().encode(`${header}.${claims}`);
  const signature = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, input),
  );
  const token = `${header}.${claims}.${btoa(String.fromCharCode(...signature))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")}`;
  const request = async () => new Response(JSON.stringify({ keys: [jwk] }));
  assert.equal(await verifySchedulerOidc(token, 1500, request as typeof fetch), true);
  assert.equal(
    await verifySchedulerOidc(`${header}.${claims}.bad`, 1500, request as typeof fetch),
    false,
  );
});
