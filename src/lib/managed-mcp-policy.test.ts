import test from "node:test";
import assert from "node:assert/strict";
import {
  managedAccountId,
  assertManagedAccount,
  managedToolDescriptor,
  managedFailureCode,
} from "./managed-mcp-policy.ts";
const account = { id: "ca_one", user_id: "owner", status: "ACTIVE", toolkit: { slug: "tinyfish" } };
test("managed references and exact provider/owner/status checks reject mismatches", () => {
  assert.equal(managedAccountId("composio://connected-account/ca_one"), "ca_one");
  assert.throws(() => managedAccountId("composio://connected-account/../other"));
  assert.equal(assertManagedAccount("tinyfish", ["owner"], account, "ca_one"), "owner");
  for (const bad of [
    { ...account, user_id: "other" },
    { ...account, status: "EXPIRED" },
    { ...account, id: "ca_other" },
    { ...account, is_disabled: true },
    { ...account, auth_config: { is_disabled: true } },
  ])
    assert.throws(() => assertManagedAccount("tinyfish", ["owner"], bad, "ca_one"));
  assert.throws(() => assertManagedAccount("telegram", ["owner"], account, "ca_one"));
});
test("full JSON schema and property-map schema are normalized without changing required fields", () => {
  const base = {
    slug: "TINYFISH_LIST_PROFILES",
    toolkit: { slug: "tinyfish" },
    version: "20261001_00",
  };
  const schema = { type: "object", properties: {}, additionalProperties: false };
  assert.deepEqual(
    managedToolDescriptor("tinyfish", { ...base, input_parameters: schema }).inputSchema,
    schema,
  );
  const mapped = managedToolDescriptor("tinyfish", {
    ...base,
    input_parameters: { name: { type: "string", required: true } },
  });
  assert.deepEqual(mapped.inputSchema, {
    type: "object",
    properties: { name: { type: "string" } },
    required: ["name"],
  });
  assert.equal(mapped.annotations.readOnlyHint, true);
  assert.equal(
    managedToolDescriptor("tinyfish", {
      ...base,
      slug: "TINYFISH_START_RUN",
      input_parameters: schema,
    }).annotations.destructiveHint,
    true,
  );
  assert.throws(() => managedToolDescriptor("telegram", { ...base, input_parameters: schema }));
  assert.throws(() => managedToolDescriptor("tinyfish", base));
});

test("provider failure categories expose no raw upstream diagnostics", () => {
  assert.equal(
    managedFailureCode({ data: { status_code: 401, message: "Unauthorized" } }),
    "provider_authorization_required",
  );
  assert.equal(managedFailureCode({ error: "403 Forbidden" }), "provider_access_denied");
  assert.equal(managedFailureCode({ error: "429 rate limit" }), "provider_rate_limited");
  assert.equal(
    managedFailureCode({ error: "schema validation error" }),
    "provider_arguments_rejected",
  );
  assert.equal(managedFailureCode({ error: "private diagnostic" }), "provider_action_failed");
});
