import assert from "node:assert/strict";
import test from "node:test";
import { AVAILABLE_KEY_SCOPES, scopesForProfile } from "./access-profiles.ts";

test("administrator receives the complete supported surface", () => {
  assert.deepEqual(scopesForProfile("administrator"), [...AVAILABLE_KEY_SCOPES]);
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
