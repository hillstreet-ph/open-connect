import assert from "node:assert/strict";
import test from "node:test";
import { taskBoardColumns, taskMove, type TaskRecord } from "./task-board.ts";
import { TASK_STATUSES, taskStatusInput } from "./operations.ts";
const task = (id: string, status: string, updated_at = "2026-10-26T01:00:00Z"): TaskRecord => ({
  id,
  status,
  updated_at,
  title: id,
  description: null,
  due_at: null,
  project_id: null,
  priority: "medium",
});

test("Kanban has exactly one column per status and never duplicates a moved card", () => {
  const columns = taskBoardColumns([
    task("a", "todo"),
    task("b", "blocked"),
    task("a", "done", "2026-10-26T01:01:00Z"),
  ]);
  assert.deepEqual(
    columns.map((c) => c.status),
    [...TASK_STATUSES],
  );
  assert.equal(columns.flatMap((c) => c.tasks).length, 2);
  assert.equal(columns.find((c) => c.status === "todo")?.tasks.length, 0);
  assert.equal(columns.find((c) => c.status === "done")?.tasks[0]?.id, "a");
});
test("Kanban moves preserve identity and concurrency version and reject external drops", () => {
  const records = [task("a", "todo")];
  assert.deepEqual(taskMove(records, "a", "in_progress"), {
    id: "a",
    status: "in_progress",
    expectedUpdatedAt: records[0]?.updated_at,
  });
  assert.equal(taskMove(records, "foreign", "done"), null);
  assert.equal(taskMove(records, "a", "todo"), null);
  assert.equal(taskMove(records, "a", "unknown"), null);
});
test("task status requests validate known transitions and timestamps", () => {
  const id = "38dbd2cc-d2ae-4cf0-8fbf-ae6bc6e90a70";
  for (const status of TASK_STATUSES)
    assert.equal(taskStatusInput.safeParse({ id, status }).success, true);
  assert.equal(
    taskStatusInput.safeParse({ id, status: "done", expectedUpdatedAt: "invalid" }).success,
    false,
  );
  assert.equal(taskStatusInput.safeParse({ id, status: "published" }).success, false);
});
