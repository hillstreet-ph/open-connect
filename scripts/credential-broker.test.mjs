import assert from "node:assert/strict";
import test from "node:test";
import { resolveProfile } from "./credential-broker.mjs";

test("reports missing credentials without exposing values", () => {
  const result = resolveProfile("openai-agent", {});
  assert.equal(result.ready, false);
  assert.deepEqual(result.missing, ["OPENAI_API_KEY"]);
  assert.equal(JSON.stringify(result).includes("secret-value"), false);
});

test("selects one supported alias from an any-of group", () => {
  const result = resolveProfile("github-release", { GITHUB_TOKEN: "secret-value" });
  assert.equal(result.ready, true);
  assert.deepEqual(result.selected, ["GITHUB_TOKEN"]);
  assert.equal(JSON.stringify(result).includes("secret-value"), false);
});

test("injects only profile-scoped names", () => {
  const result = resolveProfile("open-connect-plugin", {
    OPEN_CONNECT_API_KEY: "secret-value",
    OPENAI_API_KEY: "other-secret",
  });
  assert.deepEqual(result.selected, ["OPEN_CONNECT_API_KEY"]);
});
