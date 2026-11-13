// Deterministic, serializable task state machine. No network or privileged actions.
export const STATES = Object.freeze({
  queued: "queued",
  running: "running",
  awaitingApproval: "awaiting_approval",
  validating: "validating",
  failed: "failed",
  completed: "completed",
});

const transitions = {
  queued: ["running"],
  running: ["awaiting_approval", "validating", "failed"],
  awaiting_approval: ["running", "failed"],
  validating: ["completed", "running", "failed"],
  failed: ["queued"],
  completed: [],
};

export function createTask({ id, goal, maxAttempts = 3 }) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new Error("Invalid task id");
  if (typeof goal !== "string" || !goal.trim()) throw new Error("Goal required");
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) {
    throw new Error("Invalid retry limit");
  }
  return {
    schemaVersion: 1,
    id,
    goal: goal.trim(),
    status: STATES.queued,
    attempts: 0,
    maxAttempts,
    history: [],
    approval: null,
  };
}

export function transition(task, next, { actor, evidence = null } = {}) {
  if (!transitions[task.status]?.includes(next)) {
    throw new Error(`Invalid transition: ${task.status} -> ${next}`);
  }
  if (!actor || typeof actor !== "string") throw new Error("Actor required");
  if (next === STATES.running && task.status === STATES.queued) {
    if (task.attempts >= task.maxAttempts) throw new Error("Retry limit reached");
  }
  if (next === STATES.completed && !evidence) {
    throw new Error("Completion requires verification evidence");
  }
  if (task.status === STATES.awaitingApproval && next === STATES.running) {
    if (!task.approval?.approved || !task.approval?.approvedBy) {
      throw new Error("Authorized approval required");
    }
  }
  const updated = structuredClone(task);
  if (next === STATES.running && task.status === STATES.queued) updated.attempts += 1;
  updated.status = next;
  updated.history.push({ from: task.status, to: next, actor, evidence });
  return updated;
}

export function requestApproval(task, { action, scope }) {
  if (task.status !== STATES.running) throw new Error("Task not running");
  if (!action || !scope) throw new Error("Action and scope required");
  const updated = transition(task, STATES.awaitingApproval, { actor: "policy" });
  updated.approval = { action, scope, approved: false, approvedBy: null };
  return updated;
}

export function approve(task, { approvedBy, action, scope }) {
  if (task.status !== STATES.awaitingApproval) throw new Error("No pending approval");
  if (!approvedBy || action !== task.approval?.action || scope !== task.approval?.scope) {
    throw new Error("Approval does not match requested action and scope");
  }
  const updated = structuredClone(task);
  updated.approval = { ...updated.approval, approved: true, approvedBy };
  return updated;
}
