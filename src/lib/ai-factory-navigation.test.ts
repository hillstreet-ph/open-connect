import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { factorySearch } from "./ai-factory-navigation.ts";

test("old bookmarks preserve valid workforce and team selections", () => {
  const selections = {
    agent: "10000000-0000-4000-8000-000000000001",
    chat: "20000000-0000-4000-8000-000000000001",
    project: "30000000-0000-4000-8000-000000000001",
    view: "teams" as const,
  };
  assert.deepEqual(factorySearch(selections), selections);
  assert.deepEqual(
    factorySearch({
      agent: "invalid",
      chat: [],
      project: 42,
      view: "other",
      redirect: "https://example.com",
    }),
    {},
  );
});

test("legacy route redirects to the single AI Factory workspace", () => {
  const legacy = readFileSync(
    new URL("../routes/_authenticated/ai-agency.tsx", import.meta.url),
    "utf8",
  );
  assert.match(legacy, /validateSearch: factorySearch/);
  assert.match(legacy, /throw redirect\(\{ to: "\/ai-factory", search, replace: true \}\)/);
  assert.doesNotMatch(legacy, /WorkforceDirectory|useMutation|component:/);
});

test("/ai-factory is a shim onto the merged platform, not a second page", () => {
  const shim = readFileSync(
    new URL("../routes/_authenticated/ai-factory.tsx", import.meta.url),
    "utf8",
  );
  // It must not render a workspace of its own any more.
  assert.doesNotMatch(shim, /WorkforceDirectory|FactoryWorkspace|useMutation|component:/);
  // Every legacy view value has to resolve to a real roster section.
  assert.match(shim, /teams: "\/ai-factory\/roster\/team-builder"/);
  assert.match(shim, /workforce: "\/ai-factory\/roster\/workforce"/);
  assert.match(shim, /roster: "\/ai-factory\/roster\/"/);
  // A specialist selection goes to the Workforce view.
  assert.match(shim, /search\.agent \|\| search\.chat/);
});
