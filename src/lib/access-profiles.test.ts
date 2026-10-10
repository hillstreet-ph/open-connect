import assert from "node:assert/strict";
import test from "node:test";
import {
  AVAILABLE_KEY_SCOPES,
  scopesForProfile,
  validateKeyAccessChange,
  requireKeyScopeAuthority,
} from "./access-profiles.ts";

test("administrator receives the complete supported surface", () => {
  assert.deepEqual(scopesForProfile("administrator"), [...AVAILABLE_KEY_SCOPES]);
  assert.equal(scopesForProfile("administrator").includes("control:write"), true);
});

test("explicit access updates validate identity, profile and every requested scope", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  assert.throws(() => validateKeyAccessChange({ id: "other", profile: "developer" }));
  assert.throws(() => validateKeyAccessChange({ id, profile: "legacy" }));
  assert.throws(() => validateKeyAccessChange({ id, profile: "custom", scopes: ["*"] }));
  assert.throws(() => validateKeyAccessChange({ id, profile: "developer", scopes: ["unknown"] }));
  assert.deepEqual(
    validateKeyAccessChange({ id, profile: "developer" }).scopes,
    scopesForProfile("developer"),
  );
  assert.deepEqual(
    validateKeyAccessChange({ id, profile: "custom", scopes: ["knowledge:read", "knowledge:read"] })
      .scopes,
    ["knowledge:read"],
  );
});

test("control permissions require an actual Admin role, including custom profiles", () => {
  for (const role of ["user", "developer", "publisher", "administrator", "unknown"]) {
    assert.throws(() => requireKeyScopeAuthority([role], ["control:write"]));
    requireKeyScopeAuthority([role], scopesForProfile("developer"));
  }
  requireKeyScopeAuthority(["admin"], scopesForProfile("administrator"));
  requireKeyScopeAuthority(["owner"], ["control:write"]);
  assert.throws(() => requireKeyScopeAuthority([], ["control:write"]));
});

test("custom profiles reject unknown and duplicate scopes", () => {
  assert.deepEqual(scopesForProfile("custom", ["models:read", "unknown", "models:read"]), [
    "models:read",
  ]);
});

test("read-only cannot invoke tools, models, agents, or connections", () => {
  const scopes = scopesForProfile("read_only");
  assert.equal(
    scopes.some((scope) => scope.endsWith(":invoke")),
    false,
  );
  assert.equal(scopes.includes("resources:write"), false);
});
