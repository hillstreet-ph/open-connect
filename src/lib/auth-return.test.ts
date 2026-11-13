import test from "node:test";
import assert from "node:assert/strict";
import { safeAuthReturn } from "./auth-return.ts";

test("preserves workspace destinations and OAuth consent query", () => {
  for (const path of [
    "/connections?provider=github",
    "/projects/example#tasks",
    "/oauth/authorize?client_id=test&state=hello",
    "/",
  ])
    assert.equal(safeAuthReturn(path), path);
});
test("rejects external destinations, auth loops, and encoded path attacks", () => {
  for (const path of [
    undefined,
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "/%2f%2fevil.test",
    "/%5cevil.test",
    "/auth?returnTo=/auth",
    "/unknown",
    "/%0aevil",
    "/%zz",
  ])
    assert.equal(safeAuthReturn(path), "/dashboard");
});
