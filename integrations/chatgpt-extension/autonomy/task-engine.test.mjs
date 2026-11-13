import assert from "node:assert/strict";
import test from "node:test";
import { STATES, createTask, transition, requestApproval, approve } from "./task-engine.mjs";

test("tasks are serializable and can resume from persisted JSON", () => {
  const original = createTask({ id: "task_1", goal: "Validate extension" });
  const resumed = JSON.parse(JSON.stringify(original));
  const running = transition(resumed, STATES.running, { actor: "runner" });
  assert.equal(running.attempts, 1);
  assert.equal(original.status, STATES.queued);
});

test("completion requires evidence", () => {
  const running = transition(createTask({ id: "t2", goal: "Test" }), STATES.running, {
    actor: "runner",
  });
  const validating = transition(running, STATES.validating, { actor: "runner" });
  assert.throws(() => transition(validating, STATES.completed, { actor: "runner" }), /evidence/);
  assert.equal(
    transition(validating, STATES.completed, { actor: "runner", evidence: "CI run 123" }).status,
    STATES.completed,
  );
});

test("privileged action requires matching approval", () => {
  const running = transition(createTask({ id: "t3", goal: "Deploy" }), STATES.running, {
    actor: "runner",
  });
  const pending = requestApproval(running, { action: "deploy", scope: "production" });
  assert.throws(() => transition(pending, STATES.running, { actor: "runner" }), /approval/);
  assert.throws(
    () => approve(pending, { approvedBy: "reviewer", action: "merge", scope: "production" }),
    /match/,
  );
  const authorized = approve(pending, {
    approvedBy: "reviewer",
    action: "deploy",
    scope: "production",
  });
  assert.equal(transition(authorized, STATES.running, { actor: "runner" }).status, STATES.running);
});

test("invalid transitions and unbounded retries are rejected", () => {
  const task = createTask({ id: "t4", goal: "Repair", maxAttempts: 1 });
  assert.throws(
    () => transition(task, STATES.completed, { actor: "runner", evidence: "fake" }),
    /Invalid transition/,
  );
  const running = transition(task, STATES.running, { actor: "runner" });
  const failed = transition(running, STATES.failed, { actor: "runner" });
  const queued = transition(failed, STATES.queued, { actor: "runner" });
  assert.throws(() => transition(queued, STATES.running, { actor: "runner" }), /Retry limit/);
});
