import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyFireworksModel,
  fireworksCapabilities,
  fireworksModelsFromCatalog,
  isFireworksRotationError,
  nextFireworksCandidate,
  orderFireworksModels,
  selectFireworksModelForTask,
} from "./fireworks-routing.ts";

const CATALOG = {
  data: [
    { id: "accounts/fireworks/models/llama-v3p1-8b-instruct" },
    { id: "accounts/fireworks/models/muse-glimmer-30b" },
    { id: "accounts/fireworks/models/qwen-vision" },
    { id: "accounts/fireworks/models/muse-glimmer-30b" },
    { id: "accounts/fireworks/models/deployed-reserved-endpoint" },
  ],
};

test("catalog discovery parses, tiers, deduplicates, and exposes capabilities", () => {
  const models = fireworksModelsFromCatalog(CATALOG);
  assert.equal(models.length, 4);
  const byId = new Map(models.map((model) => [model.id, model.tier]));
  assert.equal(byId.get("accounts/fireworks/models/muse-glimmer-30b"), "free");
  assert.equal(byId.get("accounts/fireworks/models/llama-v3p1-8b-instruct"), "paid");
  assert.equal(byId.get("accounts/fireworks/models/deployed-reserved-endpoint"), "subscription");
  assert.ok(fireworksCapabilities("accounts/fireworks/models/qwen-vision").includes("vision"));
  assert.ok(fireworksCapabilities("accounts/fireworks/models/muse-glimmer-30b").includes("tools"));
  assert.deepEqual(fireworksModelsFromCatalog({ data: "broken" }), []);
  assert.deepEqual(fireworksModelsFromCatalog(null), []);
});

test("free models always precede paid and subscription candidates", () => {
  const models = fireworksModelsFromCatalog(CATALOG);
  const ordered = orderFireworksModels(models);
  assert.equal(ordered[0]?.tier, "free");
  assert.equal(ordered.filter((model) => model.tier === "paid").length, 2);
  assert.equal(ordered[ordered.length - 1]?.tier, "subscription");
  assert.equal(
    ordered.findIndex((model) => model.tier === "paid") <
      ordered.findIndex((model) => model.tier === "subscription"),
    true,
  );
});

test("rotation skips rate-limited models without leaving the free tier first", () => {
  const models = fireworksModelsFromCatalog(CATALOG);
  assert.equal(isFireworksRotationError(429), true);
  assert.equal(isFireworksRotationError(503), true);
  assert.equal(isFireworksRotationError(500), false);
  const first = nextFireworksCandidate(models, new Set());
  assert.equal(first?.tier, "free");
  const afterFreeExhausted = nextFireworksCandidate(
    models,
    new Set(["accounts/fireworks/models/muse-glimmer-30b"]),
  );
  assert.equal(afterFreeExhausted?.tier, "paid");
  const none = nextFireworksCandidate(models, new Set(models.map((model) => model.id)));
  assert.equal(none, null);
});

test("task selection prefers the first free model exposing the requested capability", () => {
  const models = fireworksModelsFromCatalog(CATALOG);
  const vision = selectFireworksModelForTask(models, "vision");
  assert.equal(vision?.id, "accounts/fireworks/models/qwen-vision");
  const tools = selectFireworksModelForTask(models, "tools");
  assert.equal(tools?.tier, "free");
  assert.equal(selectFireworksModelForTask(models, "quantum"), null);
});
