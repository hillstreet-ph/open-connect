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

test("redacts quoted JSON fields, escaped strings, and credential headers", () => {
  const raw = JSON.stringify({
    password: 'secret "quoted" value',
    token: "private-token-value",
    nested: { api_key: "nested-secret" },
    authorization: "Basic private-base64",
    cookie: "session=private",
  });
  const result = redactContext(raw);
  for (const secret of [
    "quoted",
    "private-token-value",
    "nested-secret",
    "private-base64",
    "session=private",
  ])
    assert.ok(!result.includes(secret), secret);
  const parsed = JSON.parse(result);
  assert.equal(parsed.password, "[REDACTED]");
  assert.equal(parsed.nested.api_key, "[REDACTED]");
  assert.ok(!redactContext('Notes: {"password":"fenced-secret"}').includes("fenced-secret"));
});

test("every worker tries the free router rather than exhausting adjacent models", async () => {
  const available = [
    {
      model: "openrouter/free",
      upstream: { name: "openrouter", baseUrl: "https://router.invalid", headers: {} },
    },
    ...Array.from({ length: 10 }, (_, i) => ({
      model: `offline-${i}:free`,
      upstream: { name: "other", baseUrl: "https://other.invalid", headers: {} },
    })),
  ];
  const result = await runFreeAgentTeam(
    available,
    { goal: "Review", context: "" },
    async (route) => {
      if (route.model !== "openrouter/free") throw Error("offline");
      return "Verified proposal";
    },
  );
  assert.ok(result.workers.every((worker) => worker.status === "completed"));
  assert.ok(result.workers.every((worker) => worker.model === "openrouter/free"));
});
test("bounded fallback crosses providers even when the first catalog contains many models", async () => {
  const available = [
    ...Array.from({ length: 10 }, (_, i) => ({
      model: `offline-${i}:free`,
      upstream: { name: "offline", baseUrl: "https://offline.invalid", headers: {} },
    })),
    {
      model: "working:free",
      upstream: { name: "working", baseUrl: "https://working.invalid", headers: {} },
    },
  ];
  const used: string[] = [];
  const result = await runFreeAgentTeam(
    available,
    { goal: "Review", context: "" },
    async (route, role) => {
      used.push(role + ":" + route.upstream.name);
      if (route.upstream.name !== "working") throw Error("offline");
      return "Verified proposal";
    },
  );
  assert.ok(result.workers.every((worker) => worker.status === "completed"));
  assert.equal(used.length, 6);
});

test("fallback keeps distinct connected credentials for the same provider eligible", async () => {
  const available = [
    ...Array.from({ length: 10 }, (_, i) => ({
      model: `offline-${i}:free`,
      upstream: {
        name: "provider",
        baseUrl: "https://provider.invalid",
        headers: { Authorization: "Bearer fixture-offline" },
      },
    })),
    {
      model: "working:free",
      upstream: {
        name: "provider",
        baseUrl: "https://provider.invalid",
        headers: { Authorization: "Bearer fixture-working" },
      },
    },
  ];
  const result = await runFreeAgentTeam(
    available,
    { goal: "Review", context: "" },
    async (route) => {
      if (route.upstream.headers["Authorization"] !== "Bearer fixture-working")
        throw Error("offline");
      return "Proposal";
    },
  );
  assert.ok(result.workers.every((worker) => worker.status === "completed"));
  assert.doesNotMatch(JSON.stringify(result), /fixture-working|fixture-offline/);
});
