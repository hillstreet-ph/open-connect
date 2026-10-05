import assert from "node:assert/strict";
import test from "node:test";
import { normalizeResourceLicense } from "./resource-license.ts";

test("normalizes supported package licenses and preserves proprietary default", () => {
  assert.equal(normalizeResourceLicense("MIT"), "MIT");
  assert.equal(normalizeResourceLicense(" Apache-2.0 "), "Apache-2.0");
  assert.equal(normalizeResourceLicense(undefined), "proprietary");
  assert.equal(normalizeResourceLicense("unreviewed-license"), "proprietary");
});
