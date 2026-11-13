import assert from "node:assert/strict";
import test from "node:test";
import {
  ROSTER_PREFIX,
  isRosterPath,
  legacyFactoryRedirect,
  rosterPageCandidates,
} from "./ai-factory-roster-assets.ts";

test("recognizes the roster sub-site and nothing beside it", () => {
  assert.equal(isRosterPath("/ai-factory/roster"), true);
  assert.equal(isRosterPath("/ai-factory/roster/"), true);
  assert.equal(isRosterPath("/ai-factory/roster/teams"), true);
  assert.equal(isRosterPath("/ai-factory/roster/assets/site.css"), true);

  assert.equal(isRosterPath("/ai-factory"), false);
  assert.equal(isRosterPath("/"), false);
  assert.equal(isRosterPath("/ai-factory/rosterx"), false);
  assert.equal(isRosterPath("/dashboard"), false);
});

test("resolves every roster page to its own HTML file", () => {
  const pages = [
    "index",
    "teams",
    "niches",
    "playbooks",
    "hub",
    "studio",
    "connectors",
    "command-center",
    "registry",
    "workforce",
    "team-builder",
  ];

  for (const page of pages) {
    // Clean URL form, which is what the roster's own relative links request.
    assert.deepEqual(rosterPageCandidates(`${ROSTER_PREFIX}${page}`), [
      `${ROSTER_PREFIX}${page}.html`,
      `${ROSTER_PREFIX}${page}/index.html`,
    ]);

    // Explicit .html form, which is what existing bookmarks request.
    assert.deepEqual(rosterPageCandidates(`${ROSTER_PREFIX}${page}.html`), [
      `${ROSTER_PREFIX}${page}.html`,
    ]);
  }
});

test("resolves the roster root to its index file", () => {
  assert.deepEqual(rosterPageCandidates("/ai-factory/roster"), [`${ROSTER_PREFIX}index.html`]);
  assert.deepEqual(rosterPageCandidates("/ai-factory/roster/"), [`${ROSTER_PREFIX}index.html`]);
});

test("leaves real asset requests to the asset layer", () => {
  // Assets have an extension and are served directly, never rewritten to .html.
  assert.deepEqual(rosterPageCandidates("/ai-factory/roster/assets/site.css"), []);
  assert.deepEqual(rosterPageCandidates("/ai-factory/roster/assets/studio.js"), []);
  assert.deepEqual(rosterPageCandidates("/ai-factory/roster/data/catalog-v11.json"), []);
  assert.deepEqual(rosterPageCandidates("/ai-factory/roster/data/agents-v10.json"), []);
  assert.deepEqual(rosterPageCandidates("/ai-factory/roster/images/agents/copywriter.webp"), []);
});

test("never claims a path outside the roster", () => {
  // The app's own routes must keep flowing to the SPA untouched.
  for (const path of ["/", "/ai-factory", "/dashboard", "/agents", "/assets/styles-CHQZXmUg.css"]) {
    assert.deepEqual(rosterPageCandidates(path), []);
  }
});

test("sends every legacy /ai-factory view to the section that now holds it", () => {
  const at = (search: string) =>
    legacyFactoryRedirect(new URL(`https://x.test/ai-factory${search}`));

  // The bare page and the roster view both land on the platform root.
  assert.equal(at(""), ROSTER_PREFIX);
  assert.equal(at("?view=roster"), ROSTER_PREFIX);
  assert.equal(at("?view=overview"), ROSTER_PREFIX);

  // The SPA's private team workspace is the Team Builder, NOT the roster's
  // 103-agent `teams` view — those are different things and must not collide.
  assert.equal(at("?view=teams"), `${ROSTER_PREFIX}team-builder`);

  // Every other view value lands on its own section.
  assert.equal(at("?view=workforce"), `${ROSTER_PREFIX}workforce`);
  assert.equal(at("?view=niches"), `${ROSTER_PREFIX}niches`);
  assert.equal(at("?view=playbooks"), `${ROSTER_PREFIX}playbooks`);
  assert.equal(at("?view=hub"), `${ROSTER_PREFIX}hub`);
  assert.equal(at("?view=command-center"), `${ROSTER_PREFIX}command-center`);
  assert.equal(at("?view=connectors"), `${ROSTER_PREFIX}connectors`);
  assert.equal(at("?view=registry"), `${ROSTER_PREFIX}registry`);
  assert.equal(at("?view=studio"), `${ROSTER_PREFIX}studio`);

  // An unknown view still lands somewhere real rather than 404ing.
  assert.equal(at("?view=does-not-exist"), ROSTER_PREFIX);

  // A specialist selection is carried to the Workforce view, whatever `view` says.
  const agent = "10000000-0000-4000-8000-000000000001";
  assert.equal(at(`?view=teams&agent=${agent}`), `${ROSTER_PREFIX}workforce?agent=${agent}`);
  assert.equal(at(`?agent=${agent}`), `${ROSTER_PREFIX}workforce?agent=${agent}`);
});

test("leaves the roster sub-site and the MCP endpoint alone", () => {
  for (const path of [
    "/ai-factory/roster/",
    "/ai-factory/roster/teams",
    "/ai-factory/roster/team-builder",
    "/ai-factory/mcp",
  ]) {
    assert.equal(legacyFactoryRedirect(new URL(`https://x.test${path}`)), null);
  }
});
