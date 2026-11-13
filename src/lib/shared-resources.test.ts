import assert from "node:assert/strict";
import test from "node:test";
import { mergeSharedProjectResources } from "./shared-resources.ts";

test("one install is available to every project without assignment or duplicate copies", () => {
  const installed = { id: "install", resources: { id: "skill", resource_type: "skill" } };
  const first = mergeSharedProjectResources([], [installed]);
  const second = mergeSharedProjectResources(
    [{ id: "old-assignment", resources: installed.resources }],
    [installed],
  );
  assert.deepEqual(first, second);
  assert.equal(first.length, 1);
  assert.equal(first[0]?.shared, true);
});

test("private Studio context needs an assignment; installed context packages remain reusable", () => {
  const privateContext = {
    id: "owned-memory",
    resources: { id: "memory", resource_type: "memory" },
  };
  assert.deepEqual(mergeSharedProjectResources([], [privateContext]), []);
  assert.equal(mergeSharedProjectResources([privateContext], [privateContext])[0]?.shared, false);
  assert.equal(
    mergeSharedProjectResources([], [{ ...privateContext, id: "installed-memory" }])[0]?.shared,
    true,
  );
});

test("removed installs disappear from unassigned projects and inaccessible resource rows are excluded", () => {
  assert.deepEqual(mergeSharedProjectResources([], [{ id: "missing", resources: null }]), []);
  assert.deepEqual(mergeSharedProjectResources([], []), []);
});
