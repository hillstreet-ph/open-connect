import assert from "node:assert/strict";
import test from "node:test";
import { backFallback } from "./back-navigation.ts";

test("public pages without history fall back to home", () => {
  assert.equal(backFallback("/oauth/authorize", false), "/");
  assert.equal(backFallback("/resources", false), "/");
});

test("nested workspace pages fall back to their nav parent", () => {
  assert.equal(backFallback("/projects/0b7f6c1e-1111-4222-8333-444455556666", true), "/projects");
});

test("top-level workspace pages fall back to the dashboard", () => {
  assert.equal(backFallback("/cloud-browser", true), "/dashboard");
  assert.equal(backFallback("/project-access/abc", true), "/dashboard");
});
