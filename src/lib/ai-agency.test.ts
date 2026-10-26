import assert from "node:assert/strict";
import test from "node:test";
import {
  AGENCY_TEAMS,
  agencyTeam,
  agencyTranscript,
  runAgencyTeam,
  validateAgencyInput,
} from "./ai-agency.ts";
import {
  BROWSER_PRIMARY_PROVIDERS,
  BROWSER_PROVIDERS,
  browserProviderSurface,
  browserToolFamily,
} from "./browser-provider-selection.ts";

const routes = ["one", "two", "three"].map((name) => ({
  model: `${name}:free`,
  upstream: {
    name,
    baseUrl: "https://example.invalid",
    headers: { Authorization: "Bearer fixture-private-key" },
  },
}));

test("category teams are distinct, have three specialists and reject unknown teams", () => {
  assert.ok(AGENCY_TEAMS.some((team) => team.id === "development"));
  assert.ok(AGENCY_TEAMS.some((team) => team.id === "business"));
  assert.equal(new Set(AGENCY_TEAMS.map((team) => team.id)).size, AGENCY_TEAMS.length);
  for (const team of AGENCY_TEAMS) assert.equal(new Set(team.roles).size, 3);
  assert.throws(() => agencyTeam("untrusted-admin-team"), /Choose/);
});

test("category requests and saved transcripts redact credentials", async () => {
  const input = validateAgencyInput({
    category: "business",
    goal: "Plan launch",
    context: 'password="private-value"',
  });
  const roles: string[] = [];
  const result = await runAgencyTeam(routes, input, async (_route, role, task) => {
    roles.push(role);
    assert.doesNotMatch(task.context, /private-value/);
    assert.match(task.context, /costs/);
    return 'Recommendation; token="worker-secret"';
  });
  assert.equal(result.category, "business");
  assert.deepEqual(
    result.workers.map((worker) => worker.role),
    agencyTeam("business").roles,
  );
  assert.ok(roles.some((role) => role.includes("Business strategist")));
  assert.equal(result.execution_performed, false);
  assert.doesNotMatch(agencyTranscript(result), /private-value|worker-secret|fixture-private-key/);
});

test("an offline category reports unavailable workers and no false execution success", async () => {
  const result = await runAgencyTeam(
    routes,
    validateAgencyInput({ category: "development", goal: "Build" }),
    async () => {
      throw new Error("offline");
    },
  );
  assert.ok(result.workers.every((worker) => worker.status === "unavailable"));
  assert.equal(result.execution_performed, false);
  await assert.rejects(
    runAgencyTeam(
      [],
      validateAgencyInput({ category: "research", goal: "Review" }),
      async () => "unused",
    ),
    /No verified free/,
  );
});

test("browser workers share one tools surface and native providers keep distinct sessions", () => {
  assert.deepEqual(
    BROWSER_PRIMARY_PROVIDERS.map((provider) => provider.id),
    ["tinyfish", "browser_use", "browserbase", "external"],
  );
  assert.equal(browserToolFamily("verification"), "captcha");
  assert.equal(browserToolFamily("tinyfish_tools"), "tinyfish");
  assert.equal(browserToolFamily("browserbase"), undefined);
  for (const provider of BROWSER_PROVIDERS) {
    const surface = browserProviderSurface(provider.id);
    assert.ok(BROWSER_PRIMARY_PROVIDERS.some((item) => item.id === surface));
    assert.equal(
      surface,
      ["tinyfish", "browser_use", "browserbase"].includes(provider.id) ? provider.id : "external",
    );
  }
});
