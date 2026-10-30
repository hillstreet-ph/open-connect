import test from "node:test";
import assert from "node:assert/strict";
import { collectAutoFreeRoutes, appendPaidBackupRoutes } from "./auto-free-routing.ts";

test("catalog discovery runs concurrently and the free router precedes slow providers", async () => {
  const upstreams = [
    { name: "nvidia", account: "a" },
    { name: "openrouter", account: "b" },
  ];
  const started: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pending = collectAutoFreeRoutes(upstreams, async (upstream) => {
    started.push(upstream.name);
    await gate;
    return upstream.name === "openrouter" ? ["openrouter/free", "model-b"] : ["model-a"];
  });
  assert.deepEqual(started, ["nvidia", "openrouter"]);
  release();
  const routes = await pending;
  assert.equal(routes[0]?.model, "openrouter/free");
  assert.equal(routes[0]?.upstream, upstreams[1]);
  assert.equal(routes.filter((route) => route.model === "openrouter/free").length, 1);
  assert.deepEqual(
    routes.slice(1).map((route) => route.model),
    ["model-a", "model-b"],
  );
});

test("LiteLLM zero-cost free router remains available without an OpenRouter account", async () => {
  const upstream = { name: "litellm" };
  const routes = await collectAutoFreeRoutes([upstream], async () => ["openrouter/free"]);
  assert.deepEqual(routes, [{ upstream, model: "openrouter/free" }]);
});

test("paid backup follows every free route and runs once per eligible upstream", () => {
  const openrouter = { name: "openrouter" };
  const openai = { name: "openai" };
  const groq = { name: "groq" };
  const free = [
    { upstream: openrouter, model: "openrouter/free" },
    { upstream: groq, model: "llama-3.3-70b:free" },
  ];
  const ladder = appendPaidBackupRoutes(free, [openrouter, openai, groq], (upstream) =>
    upstream.name === "openrouter"
      ? "openai/gpt-4o-mini"
      : upstream.name === "openai"
        ? "gpt-4o-mini"
        : null,
  );
  assert.deepEqual(ladder, [
    { upstream: openrouter, model: "openrouter/free", tier: "free" },
    { upstream: groq, model: "llama-3.3-70b:free", tier: "free" },
    { upstream: openrouter, model: "openai/gpt-4o-mini", tier: "paid" },
    { upstream: openai, model: "gpt-4o-mini", tier: "paid" },
  ]);
});

test("a paid backup identical to an existing free route is not retried", () => {
  const openrouter = { name: "openrouter" };
  const free = [{ upstream: openrouter, model: "openai/gpt-4o-mini" }];
  const ladder = appendPaidBackupRoutes(free, [openrouter], () => "openai/gpt-4o-mini");
  assert.deepEqual(ladder, [{ upstream: openrouter, model: "openai/gpt-4o-mini", tier: "free" }]);
});

test("with no free routes the ladder is paid backups only", () => {
  const openai = { name: "openai" };
  const ladder = appendPaidBackupRoutes([], [openai], () => "gpt-4o-mini");
  assert.deepEqual(ladder, [{ upstream: openai, model: "gpt-4o-mini", tier: "paid" }]);
});
