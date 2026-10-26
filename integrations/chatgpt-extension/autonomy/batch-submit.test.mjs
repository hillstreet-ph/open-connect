import assert from "node:assert/strict";
import test from "node:test";
import { submitBatch } from "./batch-submit.mjs";

function store() {
  const data = new Map();
  return {
    load: async (id) => data.get(id) || null,
    save: async (task) => {
      data.set(task.id, task);
    },
  };
}

test("queues validated batch without executing", async () => {
  const result = await submitBatch({
    store: store(),
    requests: [
      { id: "a", goal: "Inspect CI" },
      { id: "b", goal: "Prepare validation" },
    ],
  });
  assert.deepEqual(result.accepted, ["a", "b"]);
  assert.equal(result.executionStarted, false);
});

test("rejects duplicates and oversize batches", async () => {
  const s = store();
  await assert.rejects(
    () => submitBatch({
      store: s,
      requests: [
        { id: "a", goal: "One" },
        { id: "a", goal: "Two" },
      ],
    }),
    /Duplicate/,
  );
  await assert.rejects(
    () => submitBatch({
      store: s,
      requests: Array.from({ length: 26 }, (_, i) => ({
        id: `job_${i}`,
        goal: "Task",
      })),
    }),
    /batch size/,
  );
});
