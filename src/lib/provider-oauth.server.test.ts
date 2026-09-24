import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGitHubAuthorizationUrl,
  exchangeGitHubCode,
  githubCallbackUrl,
  sha256,
} from "./provider-oauth.server.ts";

test("builds the official GitHub authorization URL with state and callback", () => {
  const value = buildGitHubAuthorizationUrl({
    clientId: "client-123",
    appUrl: "https://open-connect.site/",
    state: "opaque-state",
  });
  const url = new URL(value);
  assert.equal(url.origin, "https://github.com");
  assert.equal(url.pathname, "/login/oauth/authorize");
  assert.equal(url.searchParams.get("client_id"), "client-123");
  assert.equal(
    url.searchParams.get("redirect_uri"),
    githubCallbackUrl("https://open-connect.site"),
  );
  assert.equal(url.searchParams.get("state"), "opaque-state");
  assert.match(url.searchParams.get("scope") ?? "", /read:user/);
});

test("hashes OAuth state without storing the browser value", async () => {
  assert.equal((await sha256("state")).length, 64);
  assert.notEqual(await sha256("state"), "state");
});

test("exchanges a GitHub code and verifies the provider identity", async () => {
  const calls: string[] = [];
  const send = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("access_token")) {
      return new Response(
        JSON.stringify({ access_token: "provider-token", scope: "repo,read:user" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    return new Response(JSON.stringify({ id: 42, login: "hillstreet-ph" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  const result = await exchangeGitHubCode({
    code: "one-time-code",
    clientId: "client-id",
    clientSecret: "client-secret",
    appUrl: "https://open-connect.site",
    send,
  });
  assert.deepEqual(calls, [
    "https://github.com/login/oauth/access_token",
    "https://api.github.com/user",
  ]);
  assert.equal(result.accountId, "42");
  assert.equal(result.accountLogin, "hillstreet-ph");
  assert.deepEqual(result.scopes, ["repo", "read:user"]);
});
