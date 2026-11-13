import { test } from "node:test";
import assert from "node:assert/strict";
import { BrowserTasks } from "./tasks.mjs";
import { BrowserPool } from "./pool.mjs";

test("cancelled task identities cannot act again or cancel a replacement task", () => {
  const tasks = new BrowserTasks();
  const a = tasks.start("a"),
    b = tasks.start("b");
  assert.throws(() => tasks.start("a"), /task_busy/);
  assert.throws(() => tasks.assert("b", a), /task_cancelled/);
  tasks.cancel("a");
  assert.throws(() => tasks.assert("a", a), /task_cancelled/);
  tasks.assert("b", b);
  const replacement = tasks.start("a");
  tasks.finish("a", a);
  tasks.assert("a", replacement);
});
test("abandoned task locks expire", () => {
  let now = 0;
  const tasks = new BrowserTasks({ lifetimeMs: 10, now: () => now });
  const old = tasks.start("a");
  now = 11;
  const current = tasks.start("a");
  assert.notEqual(current, old);
  assert.throws(() => tasks.assert("a", old), /task_cancelled/);
  tasks.assert("a", current);
});
test("pool cancellation interrupts active work, blocks queued work and preserves other owners", async () => {
  let rejectActive,
    closed = 0,
    queuedRan = false;
  const pool = new BrowserPool(async (owner) => ({
    owner,
    close: async () => {
      closed++;
      rejectActive?.(new Error("closed"));
    },
  }));
  await pool.run("b", (backend) => assert.equal(backend.owner, "b"));
  let entered;
  const ready = new Promise((resolve) => {
    entered = resolve;
  });
  const active = pool.run("a", () => {
    entered();
    return new Promise((_resolve, reject) => {
      rejectActive = reject;
    });
  });
  const pending = pool.run("a", () => {
    queuedRan = true;
  });
  const settled = Promise.allSettled([active, pending]);
  await ready;
  await pool.cancel("a");
  const results = await settled;
  assert.equal(results[0].status, "rejected");
  assert.equal(results[1].status, "rejected");
  assert.equal(queuedRan, false);
  assert.equal(closed, 1);
  assert.equal(pool.sessions.has("a"), false);
  assert.equal(pool.sessions.has("b"), true);
  await pool.close();
});
