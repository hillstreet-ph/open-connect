import assert from "node:assert/strict";
import test from "node:test";
import { assertCloudWorkspaceToolAllowed } from "./cloud-workspace-policy.ts";

test("allows read-only Twilio tools in Cloud workspace", () => {
  assert.doesNotThrow(() => assertCloudWorkspaceToolAllowed("twilio", { readOnlyHint: true }));
});

test("rejects write-capable Twilio tools in Cloud workspace", () => {
  assert.throws(
    () => assertCloudWorkspaceToolAllowed("twilio", { readOnlyHint: false }),
    /must be invoked through Open-Connect MCP/,
  );
});

test("treats missing native-provider annotations conservatively", () => {
  assert.throws(
    () => assertCloudWorkspaceToolAllowed("telegram", {}),
    /must be invoked through Open-Connect MCP/,
  );
});

test("preserves existing Custom MCP write behavior", () => {
  assert.doesNotThrow(() => assertCloudWorkspaceToolAllowed("custom_mcp", { readOnlyHint: false }));
});
