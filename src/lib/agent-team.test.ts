import test from "node:test";
import assert from "node:assert/strict";
import { redactContext, runFreeAgentTeam, validateTeamInput } from "./agent-team.ts";
const routes = ["a", "b", "c"].map((name) => ({
  model: `${name}:free`,
  upstream: { name, baseUrl: "https://example.invalid", headers: {} },
}));
test("rotates independent workers through supplied free routes without executing proposals", async () => {
  const used: string[] = [];
  const result = await runFreeAgentTeam(
    routes,
    { goal: "Review a UI", context: "" },
    async (route, role) => {
      used.push(route.model);
      return role;
    },
  );
  assert.deepEqual(used, ["a:free", "b:free", "c:free"]);
  assert.equal(result.workers.length, 3);
  assert.equal(result.execution_performed, false);
});
test("bounds fallback and reports partial failures instead of inventing completion", async () => {
  let calls = 0;
  const result = await runFreeAgentTeam(routes, { goal: "Review", context: "" }, async () => {
    calls++;
    throw Error("offline");
  });
  assert.equal(calls, 9);
  assert.ok(result.workers.every((w) => w.status === "unavailable"));
  await assert.rejects(
    runFreeAgentTeam([], { goal: "Review", context: "" }, async () => "ok"),
    /No verified free/,
  );
});
test("redacts credential patterns before routing and bounds context", () => {
  const input = validateTeamInput({
    goal: "Review",
    context: 'password="secret value" token=abc sk-abcdefghijklmnop Bearer abc.def',
  });
  for (const secret of ["secret value", "token=abc", "sk-abcdefghijklmnop", "Bearer abc.def"])
    assert.ok(!input.context.includes(secret));
  assert.equal(redactContext("ordinary goal"), "ordinary goal");
  assert.throws(() => validateTeamInput({ goal: "x", context: "a".repeat(24001) }));
});
