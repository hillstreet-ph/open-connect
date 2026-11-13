import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { generateClientKey, isClientKey } from "./gateway-keys.ts";

test("model and integration issuance retains random secret entropy and stores only a hash", () => {
  for (const modelOnly of [true, false]) {
    const keys = Array.from({ length: 50 }, () => generateClientKey(modelOnly));
    assert.equal(new Set(keys.map((key) => key.raw)).size, 50);
    for (const key of keys) {
      assert.equal(isClientKey(key.raw), true);
      assert.ok(key.raw.startsWith(modelOnly ? "sk-oc-" : "oc_live_"));
      assert.equal(key.hash, createHash("sha256").update(key.raw).digest("hex"));
      assert.ok(key.prefix.length < key.raw.length);
    }
  }
});

test("legacy keys remain accepted; provider keys and malformed model keys do not", () => {
  assert.equal(isClientKey(`oc_live_${"a".repeat(64)}`), true);
  for (const key of [
    "",
    "sk-oc-short",
    `sk-oc-${"a".repeat(33)}`,
    `sk-proj-${"a".repeat(32)}`,
    `sk-or-v1-${"a".repeat(32)}`,
    `oc_live_${"a".repeat(257)}`,
  ]) {
    assert.equal(isClientKey(key), false);
  }
});
