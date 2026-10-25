import test from "node:test";
import assert from "node:assert/strict";
import {
  managedAccountId,
  assertManagedAccount,
  managedToolDescriptor,
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
