import assert from "node:assert/strict";
import test from "node:test";
import { assertAutomationRunnable } from "./automation-readiness.ts";

test("disabled automations cannot start even when invoked directly", () => {
  assert.throws(() => assertAutomationRunnable({ enabled: false, action_type: "agent" }), /Enable/);
});
test("unconfigured executors cannot report successful runs", () => {
  for (const action_type of ["notify", "webhook", "mcp", "unknown"]) {
    assert.throws(
      () => assertAutomationRunnable({ enabled: true, action_type }),
      /No action was run/,
    );
  }
});
test("enabled planning actions remain available", () => {
  for (const action_type of ["agent", "pipeline"]) {
    assert.doesNotThrow(() => assertAutomationRunnable({ enabled: true, action_type }));
  }
});
