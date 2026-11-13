import assert from "node:assert/strict";
import test from "node:test";
import { recommendCapabilities } from "./capability-router.mjs";

test("routes a deployment task to the smallest matching profiles", () => {
  const recommendations = recommendCapabilities(
    "deploy container to zeabur and check sentry errors",
  );
  assert.deepEqual(
    recommendations.map(({ profile }) => profile),
    ["sentry-release", "docker-release", "zeabur-deploy"],
  );
});

test("does not invent a capability for an unrelated task", () => {
  assert.deepEqual(recommendCapabilities("write a meeting agenda"), []);
});
