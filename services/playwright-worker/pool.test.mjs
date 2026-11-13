import { test } from "node:test";
import assert from "node:assert/strict";
import { BrowserPool } from "./pool.mjs";
import { PLAYWRIGHT_TOOLS } from "./policy.mjs";
test("owners get separate backends; repeated actions keep their session", async () => {
  let next = 0;
  const pool = new BrowserPool(async () => ({ id: ++next, close: async () => {} }));
  assert.equal(await pool.run("a", (b) => b.id), 1);
  assert.equal(await pool.run("b", (b) => b.id), 2);
  assert.equal(await pool.run("a", (b) => b.id), 1);
  await pool.close();
});
test("same owner actions serialize and a failed action does not poison the queue", async () => {
  const pool = new BrowserPool(async () => ({ close: async () => {} }));
  const events = [];
  await Promise.allSettled([
    pool.run("a", async () => {
      events.push(1);
      await Promise.resolve();
      events.push(2);
      throw new Error("failed");
    }),
    pool.run("a", async () => {
      events.push(3);
    }),
  ]);
  assert.deepEqual(events, [1, 2, 3]);
  await pool.close();
});
test("capacity and idle cleanup are bounded; active work is not swept", async () => {
  let closed = 0;
  const pool = new BrowserPool(
    async () => ({
      close: async () => {
        closed++;
      },
    }),
    { maxSessions: 1, idleMs: 10 },
  );
  await pool.run("a", async () => {
    await pool.sweep(Date.now() + 100);
    assert.equal(pool.sessions.size, 1);
  });
  await assert.rejects(
    pool.run("b", () => {}),
    /capacity/,
  );
  await pool.sweep(Date.now() + 100);
  assert.equal(closed, 1);
  assert.equal(pool.sessions.size, 0);
});
test("cloud browser never exposes worker filesystem or arbitrary server code", () => {
  for (const name of [
    "browser_run_code",
    "browser_evaluate",
    "browser_file_upload",
    "browser_install",
  ])
    assert.equal(PLAYWRIGHT_TOOLS.has(name), false);
  assert.equal(PLAYWRIGHT_TOOLS.has("browser_navigate"), true);
});
