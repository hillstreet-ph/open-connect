import test from "node:test";
import assert from "node:assert/strict";
import {
  redactDataText,
  redactDataExport,
  validateDataControls,
  defaultDataControls,
} from "./data-controls.ts";
test("automatic capture is independently opt-in for each account", () => {
  assert.equal(defaultDataControls.capture_activity, false);
  assert.equal(defaultDataControls.save_helper_memory, false);
  assert.throws(() => validateDataControls({ ...defaultDataControls, retention_days: 0 }));
  assert.deepEqual(validateDataControls({ ...defaultDataControls, capture_activity: true }), {
    ...defaultDataControls,
    capture_activity: true,
  });
});
test("common credentials are removed from auto memory and nested export fields", () => {
  const raw =
    "api_key=example-hidden-value password: secret-password Bearer hidden-bearer-value sk-oc-abcdefghijklmnop oc_live_abcdefghijk hf_abcdefghijk";
  const clean = redactDataText(raw);
  for (const secret of [
    "example-hidden-value",
    "secret-password",
    "hidden-bearer-value",
    "abcdefghijklmnop",
    "abcdefghijk",
  ])
    assert.ok(!clean.includes(secret));
  assert.deepEqual(
    redactDataExport({
      title: "Keep workflow",
      metadata: { refresh_token: "sensitive" },
      content: raw,
    }),
    { title: "Keep workflow", metadata: { refresh_token: "[REDACTED]" }, content: clean },
  );
});
