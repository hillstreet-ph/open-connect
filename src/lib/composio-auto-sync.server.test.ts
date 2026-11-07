import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTO_SYNC_MIN_INTERVAL_MS,
  autoSyncDue,
  buildSyncCatalog,
  resetAutoSyncThrottle,
} from "./composio-auto-sync.server.ts";

test("auto sync is due once per user per interval and reserves the slot immediately", () => {
  resetAutoSyncThrottle();
  const start = 1_000_000;
  assert.equal(autoSyncDue("user-a", start), true);
  assert.equal(autoSyncDue("user-a", start + 1_000), false);
  assert.equal(autoSyncDue("user-b", start + 1_000), true);
  assert.equal(autoSyncDue("user-a", start + AUTO_SYNC_MIN_INTERVAL_MS), true);
  assert.equal(autoSyncDue("", start), false);
  assert.equal(autoSyncDue("   ", start), false);
  resetAutoSyncThrottle();
});

test("curated catalog entries win over toolkit labels and both are merged", () => {
  const catalog = buildSyncCatalog(
    [
      { provider: "GMAIL", display_name: "Gmail" },
      { provider: "github", display_name: "GitHub" },
    ],
    [
      { slug: "gmail", name: "Gmail toolkit" },
      { slug: "linear", name: "Linear" },
    ],
  );
  const bySlug = new Map(catalog.map((item) => [item.slug, item.name]));
  assert.equal(bySlug.get("gmail"), "Gmail");
  assert.equal(bySlug.get("github"), "GitHub");
  assert.equal(bySlug.get("linear"), "Linear");
  assert.equal(catalog.length, 3);
});

test("empty inputs and duplicate slugs stay bounded and deterministic", () => {
  assert.deepEqual(buildSyncCatalog([], []), []);
  const catalog = buildSyncCatalog([], [
    { slug: "same", name: "first" },
    { slug: "same", name: "second" },
  ]);
  assert.deepEqual(catalog, [{ slug: "same", name: "second" }]);
});
