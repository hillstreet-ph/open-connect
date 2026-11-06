import assert from "node:assert/strict";
import test from "node:test";
import { ROSTER_PREFIX, isRosterPath, rosterPageCandidates } from "./ai-factory-roster-assets.ts";

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
