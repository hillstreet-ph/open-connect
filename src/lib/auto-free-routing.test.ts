import test from "node:test";
import assert from "node:assert/strict";
import { collectAutoFreeRoutes } from "./auto-free-routing.ts";

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
