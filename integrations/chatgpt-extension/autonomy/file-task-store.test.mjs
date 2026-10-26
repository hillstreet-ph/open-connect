import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FileTaskStore } from "./file-task-store.mjs";
import { createTask } from "./task-engine.mjs";

test("persists and reloads task after store recreation", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openconnect-task-"));
  try {
    const store = new FileTaskStore(dir);
    const task = createTask({ id: "resume_1", goal: "Resume work" });
    await store.save(task);
    const restarted = new FileTaskStore(dir);
    assert.deepEqual(await restarted.load(task.id), task);
    assert.equal(await restarted.load("missing"), null);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("rejects traversal and invalid schema", async () => {
  const store = new FileTaskStore("/tmp/unused-openconnect-store");
  assert.throws(() => store.taskPath("../secret"), /Invalid task id/);
  await assert.rejects(() => store.save({ id: "ok" }), /Unsupported task schema/);
});
