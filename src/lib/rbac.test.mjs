import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL_ROLES, canRevokeRole, can, roleLabel } from "./rbac.ts";

test("only owners can use owner-role revocation controls", () => {
  for (const role of ALL_ROLES) {
    assert.equal(canRevokeRole([role], "actor", "target", "owner"), role === "owner");
  }
});

test("admin cannot revoke own admin role but can revoke another admin", () => {
  assert.equal(canRevokeRole(["admin"], "actor", "actor", "admin"), false);
  assert.equal(canRevokeRole(["admin"], "actor", "target", "admin"), true);
  assert.equal(canRevokeRole(["owner"], "actor", "actor", "admin"), true);
});

test("non-admin roles cannot use revoke controls", () => {
  for (const actor of ["user", "developer", "publisher"]) {
    for (const target of ALL_ROLES) {
      assert.equal(canRevokeRole([actor], "actor", "target", target), false);
    }
  }
  assert.equal(canRevokeRole([], "actor", "target", "user"), false);
});

test("client label does not change stored roles or toolkit access", () => {
  assert.equal(roleLabel("user"), "Member");
  assert.equal(can(["user"], "manage_toolkits"), false);
  for (const role of ["developer", "publisher", "admin", "owner"]) {
    assert.equal(can([role], "manage_toolkits"), true);
  }
});
