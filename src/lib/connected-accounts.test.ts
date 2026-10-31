import assert from "node:assert/strict";
import test from "node:test";
import {
  buildConnectedAccounts,
  connectableProviderIds,
  describeLinkError,
  describeAccountError,
  identityAccountLabel,
  isProviderLinked,
  parseAuthCallbackError,
  providerLabel,
} from "./connected-accounts.ts";

test("every connectable provider is offered in a stable order", () => {
  assert.deepEqual(connectableProviderIds(), ["google", "github"]);
  assert.equal(providerLabel("google"), "Google");
  assert.equal(providerLabel("github"), "GitHub");
  assert.equal(providerLabel("gitlab"), "gitlab");
});

test("an account with no linked identities shows every provider as connectable", () => {
  const accounts = buildConnectedAccounts([]);
  assert.equal(accounts.length, 2);
  for (const account of accounts) {
    assert.equal(account.connected, false);
    assert.equal(account.canDisconnect, false);
    assert.equal(account.accountLabel, null);
    assert.equal(account.identity, null);
  }
});

test("a linked provider reports connected and can be disconnected while another identity remains", () => {
  const accounts = buildConnectedAccounts([
    { identity_id: "a", provider: "email", identity_data: { email: "owner@example.com" } },
    {
      identity_id: "b",
      provider: "google",
      identity_data: { email: "owner@example.com", email_verified: true },
    },
  ]);

  const google = accounts.find((account) => account.provider === "google");
  assert.equal(google?.connected, true);
  assert.equal(google?.canDisconnect, true);
  assert.equal(google?.accountLabel, "owner@example.com");

  const github = accounts.find((account) => account.provider === "github");
  assert.equal(github?.connected, false);
  assert.equal(github?.canDisconnect, false);
});

test("the only remaining identity cannot be disconnected", () => {
  const accounts = buildConnectedAccounts([
    { identity_id: "a", provider: "github", identity_data: { user_name: "octocat" } },
  ]);
  const github = accounts.find((account) => account.provider === "github");
  assert.equal(github?.connected, true);
  assert.equal(github?.canDisconnect, false);
  assert.equal(github?.accountLabel, "octocat");
});

test("account labels prefer email, then handle, then username", () => {
  assert.equal(
    identityAccountLabel({
      provider: "github",
      identity_data: { email: "a@b.co", user_name: "octocat", login: "octo" },
    }),
    "a@b.co",
  );
  assert.equal(
    identityAccountLabel({ provider: "github", identity_data: { login: "octo" } }),
    "octo",
  );
  assert.equal(identityAccountLabel({ provider: "github", identity_data: {} }), null);
  assert.equal(identityAccountLabel({ provider: "github" }), null);
  // Blank strings must not be treated as a label.
  assert.equal(identityAccountLabel({ provider: "github", identity_data: { email: "  " } }), null);
});

test("provider redirect errors are read from query string and fragment", () => {
  assert.deepEqual(
    parseAuthCallbackError(
      "https://open-connect.site/settings?error=server_error&error_code=identity_already_exists&error_description=Already+linked",
    ),
    { code: "identity_already_exists", description: "Already linked" },
  );
  assert.deepEqual(
    parseAuthCallbackError(
      "https://open-connect.site/settings#error=access_denied&error_description=User+denied",
    ),
    { code: "access_denied", description: "User denied" },
  );
  // A relative callback URL is accepted too.
  assert.deepEqual(parseAuthCallbackError("/settings?error_code=email_exists"), {
    code: "email_exists",
    description: "The provider did not complete the connection.",
  });
  // A plain settings URL carries no error.
  assert.equal(parseAuthCallbackError("https://open-connect.site/settings#security"), null);
  assert.equal(parseAuthCallbackError("/settings?linked=google"), null);
});

test("a provider is only reported connected when an identity proves it", () => {
  assert.equal(isProviderLinked([{ provider: "google" }], "google"), true);
  assert.equal(isProviderLinked([{ provider: "email" }], "google"), false);
  assert.equal(isProviderLinked([], "github"), false);
  assert.equal(isProviderLinked(null, "github"), false);
  assert.equal(isProviderLinked(undefined, "github"), false);
});

test("linking failures are explained in plain language", () => {
  assert.match(
    describeLinkError({ code: "identity_already_exists", description: "raw" }),
    /already connected/,
  );
  assert.match(
    describeLinkError({ code: "single_identity_not_deletable", description: "raw" }),
    /only sign-in method/,
  );
  assert.match(describeLinkError({ code: "access_denied", description: "raw" }), /cancelled/);
  // Unknown codes fall back to the provider description.
  assert.equal(
    describeLinkError({ code: "weird_code", description: "Something odd" }),
    "Something odd",
  );
});

test("immediate linking and unlinking errors use actionable messages", () => {
  assert.match(
    describeAccountError({ code: "identity_already_exists", message: "raw" }, "failed"),
    /already connected/,
  );
  assert.match(
    describeAccountError({ code: "single_identity_not_deletable", message: "raw" }, "failed"),
    /only sign-in method/,
  );
  assert.equal(
    describeAccountError(new Error("Network unavailable"), "failed"),
    "Network unavailable",
  );
  assert.equal(describeAccountError(null, "failed"), "failed");
});
