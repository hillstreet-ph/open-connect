import test from "node:test";
import assert from "node:assert/strict";
import {
  fanOutOpenAutoWorkers,
  isOpenAutoRequest,
  isOpenAutoRotationStatus,
  openAutoTier,
  orderOpenAutoRoutes,
  rotateOpenAutoQueue,
  runOpenAutoBuildLoop,
  runOpenAutoRoutes,
} from "./open-auto-router.ts";

test("models classify into free, paid, and subscription tiers", () => {
  assert.equal(openAutoTier("openrouter/free"), "free");
  assert.equal(openAutoTier("provider/model-x:free"), "free");
  assert.equal(openAutoTier("provider/model-x"), "paid");
  assert.equal(openAutoTier("subscription/reserved-a"), "subscription");
});

test("route ordering is free first with paid and subscription as backups", () => {
  const upstream = { name: "openrouter" };
  const routes = orderOpenAutoRoutes([
    { upstream, model: "provider/paid-model" },
    { upstream, model: "provider/free-model:free" },
    { upstream, model: "subscription/reserved-a" },
  ]);
  assert.deepEqual(
    routes.map((route) => route.model),
    ["provider/free-model:free", "provider/paid-model", "subscription/reserved-a"],
  );
  assert.deepEqual(
    routes.map((route) => route.tier),
    ["free", "paid", "subscription"],
  );
});

test("open-auto aliases are recognized and everything else is a fixed model", () => {
  assert.equal(isOpenAutoRequest("open-auto"), true);
  assert.equal(isOpenAutoRequest("Open-Connect/Open-Auto"), true);
  assert.equal(isOpenAutoRequest("openai/gpt-4o"), false);
});

test("rate-limit and capacity statuses rotate; client errors do not", () => {
  assert.equal(isOpenAutoRotationStatus(429), true);
  assert.equal(isOpenAutoRotationStatus(503), true);
  assert.equal(isOpenAutoRotationStatus(529), true);
  assert.equal(isOpenAutoRotationStatus(400), false);
  assert.equal(isOpenAutoRotationStatus(401), false);
});

test("rotation moves the queue head to the tail", () => {
  assert.deepEqual(rotateOpenAutoQueue(["a", "b", "c"]), ["b", "c", "a"]);
  assert.deepEqual(rotateOpenAutoQueue(["a"]), ["a"]);
  assert.deepEqual(rotateOpenAutoQueue([]), []);
});

test("fan-out runs independent workers in parallel, capped for stability", async () => {
  let running = 0;
  let peak = 0;
  const tasks = Array.from({ length: 10 }, (_, index) => async () => {
    running += 1;
    peak = Math.max(peak, running);
    await new Promise((resolve) => setTimeout(resolve, 10));
    running -= 1;
    return index;
  });
  const results = await fanOutOpenAutoWorkers(tasks, 4);
  assert.equal(peak, 4);
  assert.equal(results.length, 10);
  assert.deepEqual(
    results.map((result) => (result.status === "fulfilled" ? result.value : -1)),
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  );
});

test("the build loop autofixes and passes once validation succeeds", async () => {
  const fixes: string[] = [];
  let attempts = 0;
  const result = await runOpenAutoBuildLoop({
    build: async () => {},
    validate: async () => {
      attempts += 1;
      if (attempts < 3) throw new Error("test failure " + attempts);
    },
    autofix: async (attempt, failure) => {
      fixes.push(attempt + ":" + failure);
    },
  });
  assert.deepEqual(result, { status: "passed", attempts: 3, lastError: null });
  assert.deepEqual(fixes, ["1:test failure 1", "2:test failure 2"]);
});

test("the build loop reports failure after exhausting autofix attempts", async () => {
  const result = await runOpenAutoBuildLoop({
    build: async () => {},
    validate: async () => {
      throw new Error("always broken");
    },
    autofix: async () => {},
    maxAttempts: 2,
  });
  assert.equal(result.status, "failed");
  assert.equal(result.attempts, 2);
  assert.equal(result.lastError, "always broken");
});

test("route execution tries free models first and rotates past rate limits", async () => {
  const upstream = { name: "gateway" };
  const seen: string[] = [];
  const outcome = await runOpenAutoRoutes(
    [
      { upstream, model: "provider/paid-model" },
      { upstream, model: "provider/free-model:free" },
    ],
    async (route) => {
      seen.push(route.model);
      if (route.model.endsWith(":free")) return { status: 429, value: null as never };
      return { status: 200, value: "ok" };
    },
  );
  assert.deepEqual(seen, ["provider/free-model:free", "provider/paid-model"]);
  assert.equal(outcome.value, "ok");
  assert.deepEqual(outcome.attempts, [
    { model: "provider/free-model:free", status: 429 },
    { model: "provider/paid-model", status: 200 },
  ]);
});

test("route execution stops on non-rotation client errors", async () => {
  const upstream = { name: "gateway" };
  const seen: string[] = [];
  await assert.rejects(
    runOpenAutoRoutes(
      [
        { upstream, model: "provider/free-model:free" },
        { upstream, model: "provider/paid-model" },
      ],
      async (route) => {
        seen.push(route.model);
        return { status: 400, value: null as never };
      },
    ),
    /Open-Auto exhausted/,
  );
  assert.deepEqual(seen, ["provider/free-model:free"]);
});
