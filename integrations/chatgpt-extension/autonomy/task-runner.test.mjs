import assert from "node:assert/strict";
import test from "node:test";
import { TaskRunner } from "./task-runner.mjs";
import { createTask, STATES } from "./task-engine.mjs";

function memoryStore(task) {
  let current = task;
  return {
    async load(id) {
      return current.id === id ? structuredClone(current) : null;
    },
    async save(next) {
      current = structuredClone(next);
    },
  };
}

test("runs allowlisted operation and verifies completion", async () => {
  const store = memoryStore(createTask({ id: "job_1", goal: "Validate" }));
  const runner = new TaskRunner({
    store,
    handlers: { validate: async () => ({ ok: true }) },
    verifier: async ({ result }) => (result.ok ? "test passed" : null),
  });
  const task = await runner.run("job_1", "validate");
  assert.equal(task.status, STATES.completed);
  assert.equal(task.history.at(-1).evidence, "test passed");
});

test("rejects operations outside allowlist", async () => {
  const runner = new TaskRunner({
    store: memoryStore(createTask({ id: "job_2", goal: "Safe" })),
    verifier: async () => "ok",
  });
  await assert.rejects(() => runner.run("job_2", "deploy"), /allowlisted/);
});

test("failed verification persists failed status", async () => {
  const store = memoryStore(createTask({ id: "job_3", goal: "Validate" }));
  const runner = new TaskRunner({
    store,
    handlers: { validate: async () => ({ ok: false }) },
    verifier: async () => null,
  });
  await assert.rejects(() => runner.run("job_3", "validate"), /evidence/);
  assert.equal((await store.load("job_3")).status, STATES.failed);
});
