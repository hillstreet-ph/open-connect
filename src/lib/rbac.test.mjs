import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL_ROLES, canRevokeRole, can, roleLabel } from "./rbac.ts";

test("only legacy platform owners can revoke a legacy owner assignment", () => {
  for (const role of ALL_ROLES) {
    assert.equal(canRevokeRole([role], "actor", "target", "owner"), false);
  }
  assert.equal(canRevokeRole(["owner"], "actor", "target", "owner"), true);
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
  for (const role of ["developer", "admin"]) {
    assert.equal(can([role], "manage_toolkits"), true);
    assert.equal(can([role], "publish_resources"), true);
    assert.equal(can([role], "verify_resources"), true);
  }
  assert.equal(can(["user"], "publish_resources"), false);
  assert.equal(can(["user"], "verify_resources"), false);
});
