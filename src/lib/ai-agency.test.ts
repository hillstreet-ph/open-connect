import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { AGENCY_CATEGORIES, AGENCY_TEMPLATES, agencyTeamInput } from "./ai-agency.ts";
import {
  listOwnedAgencyTeams,
  saveOwnedAgencyTeam,
  ownedActiveAgencyTeam,
} from "./ai-agency.server.ts";
import { runFreeAgentTeam, validateTeamInput } from "./agent-team.ts";

test("agency templates cover each category with bounded unique agent roles", () => {
  assert.deepEqual(
    AGENCY_TEMPLATES.map((t) => t.category),
    [...AGENCY_CATEGORIES],
  );
  for (const template of AGENCY_TEMPLATES) agencyTeamInput.parse(template);
  const base = AGENCY_TEMPLATES[0]!;
  for (const roles of [
    ["Developer"],
    ["Reviewer", "reviewer"],
    Array(7).fill("Agent"),
    ["Planner", "Role\nInjected"],
  ])
    assert.equal(agencyTeamInput.safeParse({ ...base, roles }).success, false);
});
test("category-specific teams run each selected role and preserve proposal-only behavior", async () => {
  const roles = AGENCY_TEMPLATES[1]!.roles;
  const called: string[] = [];
  const routes = [
    {
      model: "model:free",
      upstream: { name: "provider", baseUrl: "https://example.invalid", headers: {} },
    },
  ];
  const result = await runFreeAgentTeam(
    routes,
    validateTeamInput({ goal: "Plan launch", context: "token=private-value" }),
    async (_route, role, input) => {
      called.push(role);
      assert.ok(!input.context.includes("private-value"));
      return `${role}: proposal`;
    },
    roles,
  );
  assert.deepEqual(called, roles);
  assert.equal(result.execution_performed, false);
  assert.ok(result.workers.every((worker) => worker.status === "completed"));
  const partial = await runFreeAgentTeam(
    routes,
    { goal: "Plan", context: "" },
    async (_route, role) => {
      if (role === roles[0]) throw Error("Offline");
      return "Proposal";
    },
    roles,
  );
  assert.equal(partial.workers[0]?.status, "unavailable");
  assert.equal(partial.workers[1]?.status, "completed");
});
test("agency REST writes bind owner and version and reject stale edits and duplicate names", async () => {
  let url: URL | undefined;
  let body: Record<string, unknown> = {};
  let mode = "ok";
  const db = createClient("https://example.supabase.co", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        url = new URL(String(input));
        body = JSON.parse(String(init?.body ?? "{}"));
        return mode === "duplicate"
          ? new Response(JSON.stringify({ code: "23505", message: "duplicate" }), {
              status: 409,
              headers: { "content-type": "application/json" },
            })
          : new Response(JSON.stringify(mode === "stale" ? [] : [{ id: "team-1" }]), {
              headers: { "content-type": "application/json" },
            });
      },
    },
  });
  const team = AGENCY_TEMPLATES[0]!;
  await saveOwnedAgencyTeam(db, "owner-1", { team });
  assert.equal(body["user_id"], "owner-1");
  await saveOwnedAgencyTeam(db, "owner-1", {
    team,
    id: "team-1",
    expectedUpdatedAt: "2026-10-26T00:00:00Z",
  });
  assert.equal(url?.searchParams.get("user_id"), "eq.owner-1");
  assert.equal(url?.searchParams.get("updated_at"), "eq.2026-10-26T00:00:00Z");
  assert.equal(body["user_id"], undefined);
  mode = "stale";
  await assert.rejects(
    saveOwnedAgencyTeam(db, "owner-1", {
      team,
      id: "team-1",
      expectedUpdatedAt: "2026-10-26T00:00:00Z",
    }),
    /Team changed/,
  );
  mode = "duplicate";
  await assert.rejects(saveOwnedAgencyTeam(db, "owner-1", { team }), /already have a team/);
});
test("owned team queries exclude foreign and archived teams before running", async () => {
  const requests: URL[] = [];
  const db = createClient("https://example.supabase.co", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input) => {
        requests.push(new URL(String(input)));
        return new Response("[]", { headers: { "content-type": "application/json" } });
      },
    },
  });
  await listOwnedAgencyTeams(db, "owner", { category: "business", archived: false });
  assert.equal(requests[0]?.searchParams.get("user_id"), "eq.owner");
  assert.equal(requests[0]?.searchParams.get("category"), "eq.business");
  assert.equal(requests[0]?.searchParams.get("archived"), "eq.false");
  await assert.rejects(ownedActiveAgencyTeam(db, "owner", "team-1"), /active team/);
  assert.equal(requests[1]?.searchParams.get("archived"), "eq.false");
  assert.equal(requests[1]?.searchParams.get("user_id"), "eq.owner");
});
