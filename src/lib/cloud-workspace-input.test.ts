import assert from "node:assert/strict";
import test from "node:test";
import { cloudConnectionInput } from "./cloud-workspace-input.ts";

const connectionId = "00000000-0000-4000-8000-000000000001";
test("cloud connections can be used personally without manufacturing a project", () => {
  assert.deepEqual(cloudConnectionInput.parse({ connectionId }), { connectionId });
});
test("project context remains an explicit valid UUID", () => {
  assert.deepEqual(cloudConnectionInput.parse({ connectionId, projectId: connectionId }), {
    connectionId,
    projectId: connectionId,
  });
  for (const input of [{ connectionId: "bad" }, { connectionId, projectId: "bad" }])
    assert.equal(cloudConnectionInput.safeParse(input).success, false);
});
