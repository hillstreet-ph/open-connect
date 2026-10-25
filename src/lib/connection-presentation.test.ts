import assert from "node:assert/strict";
import test from "node:test";
import {
  connectionIdentity,
  connectionAuthType,
  connectionEndpoint,
} from "./connection-presentation.ts";

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

test("restores MCP API-key and unauthenticated modes without inheriting another account", () => {
  assert.equal(connectionAuthType({ auth_type: "api_key" }), "api_key");
  assert.equal(connectionAuthType({ auth_type: "none" }), "none");
  assert.equal(connectionAuthType({ auth_type: "personal_access_token" }), "bearer");
  assert.equal(connectionAuthType({ auth_type: "invalid" }), "bearer");
  assert.equal(connectionAuthType(null), "bearer");
});

test("restores service addresses without leaking credentials or URL secrets", () => {
  assert.equal(connectionEndpoint("https://project.supabase.co"), "https://project.supabase.co/");
  assert.equal(
    connectionEndpoint("https://workspace.databricks.com/api"),
    "https://workspace.databricks.com/api",
  );
  assert.equal(
    connectionEndpoint("https://user:secret@example.com/mcp?key=hidden#secret"),
    "https://example.com/mcp",
  );
  assert.equal(connectionEndpoint("javascript:secret"), "");
  assert.equal(connectionEndpoint(null), "");
});
