import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyOpenAutoTier,
  isOpenAutoRotatableStatus,
  orderOpenAutoCandidates,
  routeOpenAutoChat,
  runOpenAutoWorkers,
} from "./open-auto-router.ts";

test("free-tier Fireworks models classify as free", () => {
  assert.equal(classifyOpenAutoTier("accounts/fire/models/muse-glimmer-30b"), "free");
  assert.equal(classifyOpenAutoTier("accounts/fire/models/onboarding-router"), "free");
});

test("unknown models default to paid so unverified models are never free", () => {
  assert.equal(classifyOpenAutoTier("accounts/fire/models/some-unknown"), "paid");
});

test("reserved capacity classifies as subscription", () => {
  assert.equal(classifyOpenAutoTier("accounts/fire/models/reserved-xl"), "subscription");
});

test("candidates are ordered free, paid, then subscription", () => {
  const ordered = orderOpenAutoCandidates([
    { id: "accounts/fire/models/reserved-xl" },
    { id: "accounts/fire/models/metered-a" },
    { id: "accounts/fire/models/muse-glimmer-30b" },
  ]);
  assert.deepEqual(ordered.map((model) => classifyOpenAutoTier(model.id)), [
    "free",
    "paid",
    "subscription",
  ]);
});

test("rate limits and server errors rotate; auth errors do not", () => {
  assert.equal(isOpenAutoRotatableStatus(429), true);
  assert.equal(isOpenAutoRotatableStatus(503), true);
  assert.equal(isOpenAutoRotatableStatus(401), false);
});

test("routing rotates past a rate-limited free model and continues execution", async () => {
  const calls: string[] = [];
  const rotations: string[] = [];
  const { model } = await routeOpenAutoChat({
    candidates: [
      { id: "accounts/fire/models/muse-glimmer-30b" },
      { id: "accounts/fire/models/metered-a" },
    ],
    request: { messages: [{ role: "user", content: "hello" }] },
    chat: async (candidate) => {
      calls.push(candidate);
      if (candidate.includes("glimmer")) {
        throw Object.assign(new Error("rate limited"), { status: 429 });
      }
      return { ok: true };
    },
    onRotation: (event) => rotations.push(event.from + "->" + event.to),
  });
  assert.equal(model, "accounts/fire/models/metered-a");
  assert.deepEqual(calls, [
    "accounts/fire/models/muse-glimmer-30b",
    "accounts/fire/models/metered-a",
  ]);
  assert.equal(rotations.length, 1);
});

test("capability filtering restricts candidates before ordering", async () => {
  const { model } = await routeOpenAutoChat({
    candidates: [
      { id: "accounts/fire/models/metered-a" },
      { id: "accounts/fire/models/metered-vision", capabilities: ["vision"] },
    ],
    request: { messages: [] },
    capability: "vision",
    chat: async (candidate) => ({ model: candidate }),
  });
  assert.equal(model, "accounts/fire/models/metered-vision");
});

test("authentication errors surface immediately without rotation", async () => {
  await assert.rejects(
    routeOpenAutoChat({
      candidates: [
        { id: "accounts/fire/models/metered-a" },
        { id: "accounts/fire/models/metered-b" },
      ],
      request: { messages: [] },
      chat: async () => {
        throw Object.assign(new Error("unauthorized"), { status: 401 });
      },
    }),
    /unauthorized/,
  );
});

test("parallel workers fan out concurrently, capped, and failures do not sink the batch", async () => {
  let running = 0;
  let peak = 0;
  const results = await runOpenAutoWorkers(
    Array.from({ length: 10 }, (_, index) => async () => {
      running += 1;
      peak = Math.max(peak, running);
      await Promise.resolve();
      running -= 1;
      if (index === 3) throw new Error("worker failed");
      return index;
    }),
    4,
  );
  assert.ok(peak <= 4, "concurrency exceeded cap: " + peak);
  assert.equal(results.length, 10);
  assert.equal(results.filter((result) => result.ok).length, 9);
  assert.equal(results.find((result) => !result.ok)?.error, "worker failed");
});
