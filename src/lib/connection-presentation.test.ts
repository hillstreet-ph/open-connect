import assert from "node:assert/strict";
import test from "node:test";
import { connectionIdentity } from "./connection-presentation.ts";

test("projects only safe identity fields from credential metadata", () => {
  const identity = connectionIdentity({
    account_label: "Work",
    account_login: "operator",
    account_email: "owner@example.com",
    access_token: "do-not-return",
    refresh_token: "do-not-return",
    state: { secret: "hidden" },
    endpoint_url: "https://example.com?token=hidden",
    name: "Owner",
  });
  assert.deepEqual(identity, {
    label: "Work",
    login: "operator",
    name: "Owner",
    email: "owner@example.com",
  });
  assert.ok(!JSON.stringify(identity).includes("hidden"));
  assert.ok(!JSON.stringify(identity).includes("do-not-return"));
});

test("does not invent an account identity from broker IDs or invalid metadata", () => {
  for (const value of [null, [], "token", { id: "ca_123", email: { secret: "hidden" } }]) {
    assert.deepEqual(connectionIdentity(value), { label: "", login: "", name: "", email: "" });
  }
});
