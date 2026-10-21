import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { validateCatalog } from "./sync-claude-library.mjs";
import {
  PRIVATE_SOURCE,
  PUBLIC_SOURCE,
  buildCatalog,
  buildPrivateRows,
  buildPublicRows,
  manifestUrl,
  normalizeRow,
  planSync,
  pluginUrls,
} from "./sync-claude-marketplaces.mjs";

const registry = {
  marketplaces: [
    {
      name: "alpha-market",
      repository: "acme/alpha",
      license: "Apache-2.0",
      default_category: "developer",
    },
    { name: "beta-market", repository: "acme/beta", license: null, default_category: "business" },
  ],
};

const manifests = {
  "alpha-market": {
    name: "alpha-market",
    plugins: [
      {
        name: "local-tool",
        source: "./plugins/local-tool",
        description: "Local",
        category: "database",
      },
      {
        name: "remote-tool",
        source: {
          source: "git-subdir",
          url: "https://github.com/acme/tools.git",
          path: "plugins/remote",
          ref: "v1",
        },
        homepage: "https://acme.example/remote",
        author: { name: "Acme" },
      },
      { name: "github", source: { source: "url", url: "https://github.com/acme/gh.git" } },
      { name: "leaky", source: "./plugins/leaky", description: `token ghp_${"a".repeat(36)}` },
    ],
  },
  "beta-market": {
    name: "beta-market",
    plugins: [{ name: "local-tool", source: "./local-tool", description: "Duplicate listing" }],
  },
};

test("resolves upstream URLs for relative, git-subdir and url sources", () => {
  const market = registry.marketplaces[0];
  assert.equal(
    pluginUrls({ source: "./plugins/x" }, market).source_url,
    "https://github.com/acme/alpha/tree/HEAD/plugins/x",
  );
  const sub = pluginUrls(manifests["alpha-market"].plugins[1], market);
  assert.equal(sub.source_url, "https://acme.example/remote");
  assert.equal(sub.repository_url, "https://github.com/acme/tools");
  assert.equal(sub.upstream_url, "https://github.com/acme/tools/tree/v1/plugins/remote");
});

test("builds public, unverified, metadata-only rows and merges cross-marketplace listings", () => {
  const { rows, skipped } = buildPublicRows(registry, manifests);
  const bySlug = Object.fromEntries(rows.map((row) => [row.slug, row]));
  assert.equal(rows.length, 3);
  assert.deepEqual(skipped, [
    { marketplace: "alpha-market", name: "leaky", reason: "secret_like_metadata" },
  ]);
  const local = bySlug["claude-plugin-local-tool"];
  assert.equal(local.source, PUBLIC_SOURCE);
  assert.equal(local.published, true);
  assert.equal(local.verified, false);
  assert.equal(local.category_slug, "data");
  assert.equal(local.license, "Apache-2.0");
  assert.equal(local.installation_config.executable, false);
  assert.equal(
    local.installation_config.install_command,
    "/plugin install local-tool@alpha-market",
  );
  assert.deepEqual(local.installation_config.also_listed_in, [
    { marketplace: "beta-market", install_command: "/plugin install local-tool@beta-market" },
  ]);
  for (const row of rows) assert.match(row.slug, /^claude-plugin-[a-z0-9-]+$/);
});

test("rejects a missing or mismatched marketplace manifest", () => {
  assert.throws(
    () =>
      buildPublicRows(registry, { ...manifests, "beta-market": { name: "other", plugins: [] } }),
    /mismatched: beta-market/,
  );
});

test("account skills are published, owned, unverified, and skip quarantined or duplicate records", () => {
  const catalog = {
    resources: [
      {
        slug: "claude-skill-a",
        name: "a",
        kind: "account_skill",
        review_state: "pending_security_review",
      },
      {
        slug: "claude-skill-b",
        name: "b",
        kind: "account_skill",
        review_state: "quarantined_metadata",
      },
      {
        slug: "claude-skill-c",
        name: "c",
        kind: "account_skill",
        review_state: "pending_security_review",
        duplicate_of: "c",
      },
      {
        slug: "claude-plugin-d",
        name: "d",
        kind: "plugin",
        review_state: "pending_security_review",
      },
    ],
  };
  const rows = buildPrivateRows(catalog, "owner-1");
  assert.deepEqual(
    rows.map((row) => row.slug),
    ["claude-skill-a"],
  );
  assert.equal(rows[0].published, true);
  assert.equal(rows[0].verified, false);
  assert.equal(rows[0].installation_config.executable, false);
  assert.equal(rows[0].owner_id, "owner-1");
  assert.equal(rows[0].source, PRIVATE_SOURCE);
});

test("plan never touches other sources and preserves review decisions", () => {
  const { rows } = buildPublicRows(registry, manifests);
  const existing = [
    { slug: "github-app", name: "GitHub", source: "connections", published: true, verified: true },
    {
      slug: "claude-plugin-local-tool",
      name: "local-tool",
      source: PUBLIC_SOURCE,
      published: true,
      verified: true,
      installation_config: { review_state: "approved" },
    },
    {
      slug: "claude-plugin-gone",
      name: "gone",
      source: PUBLIC_SOURCE,
      published: true,
      verified: false,
    },
  ];
  const plan = planSync(rows, existing);
  assert.deepEqual(
    plan.insert.map((row) => row.slug),
    ["claude-plugin-remote-tool"],
  );
  assert.deepEqual(plan.already_in_library, [
    { slug: "claude-plugin-github", existing: "github-app" },
  ]);
  assert.equal(plan.update.length, 1);
  const update = plan.update[0];
  assert.equal(update.installation_config.review_state, "approved");
  for (const key of ["published", "verified", "featured", "owner_id"])
    assert.ok(!(key in update), key);
  assert.deepEqual(plan.unpublish, ["claude-plugin-gone"]);
});

test("insert batches share one key set so PostgREST accepts them", () => {
  const { rows } = buildPublicRows(registry, manifests);
  const privateRows = buildPrivateRows(
    {
      resources: [
        {
          slug: "claude-skill-a",
          name: "a",
          kind: "account_skill",
          review_state: "pending_security_review",
        },
      ],
    },
    "owner-1",
  );
  const keys = new Set([...rows, ...privateRows].map((row) => Object.keys(row).sort().join(",")));
  assert.equal(keys.size, 1);
});

test("committed marketplace registry is metadata-only and non-installing", () => {
  const committed = JSON.parse(
    readFileSync(
      resolve(import.meta.dirname, "../config/claude-marketplaces.registry.json"),
      "utf8",
    ),
  );
  assert.equal(committed.policy.mode, "metadata_only");
  assert.equal(committed.policy.auto_install, false);
  assert.equal(committed.policy.public_rows_verified, false);
  assert.ok(committed.marketplaces.length >= 7);
  for (const marketplace of committed.marketplaces)
    assert.match(marketplace.repository, /^anthropics\/[a-z0-9-]+$/);
});

test("committed catalog drops resources the library already holds and validates", () => {
  const libraryCatalog = {
    resources: [
      {
        slug: "claude-skill-a",
        name: "a",
        kind: "account_skill",
        review_state: "pending_security_review",
      },
    ],
  };
  const libraryIndex = new Map([
    ["github-app", "github-app"],
    ["github", "github-app"],
  ]);
  const { catalog, alreadyInLibrary } = buildCatalog(
    registry,
    manifests,
    libraryCatalog,
    libraryIndex,
  );
  assert.deepEqual(alreadyInLibrary, [{ slug: "claude-plugin-github", existing: "github-app" }]);
  assert.deepEqual(
    catalog.resources.map((row) => row.slug),
    ["claude-plugin-local-tool", "claude-plugin-remote-tool", "claude-skill-a"],
  );
  assert.equal(catalog.counts.plugins, 2);
  assert.equal(catalog.counts.account_skills, 1);
  assert.equal(catalog.counts.upstream_listings, 5);
  assert.deepEqual(validateCatalog(catalog), []);
});

test("normalized rows carry exactly the resource columns", () => {
  const row = normalizeRow({
    slug: "claude-plugin-x",
    name: "x",
    review_state: "pending_security_review",
  });
  assert.ok(!("review_state" in row));
  assert.equal(row.owner_id, null);
  assert.equal(row.description, null);
  assert.equal(Object.keys(row).length, 18);
});

test("manifest URLs come only from the allowlist", () => {
  assert.equal(
    manifestUrl("anthropics/claude-plugins-official"),
    "https://raw.githubusercontent.com/anthropics/claude-plugins-official/HEAD/.claude-plugin/marketplace.json",
  );
  for (const bad of [
    "https://evil.example/x",
    "anthropics/other",
    "a/../b",
    "constructor",
    "__proto__",
  ])
    assert.throws(() => manifestUrl(bad), /not allowlisted/, bad);
});

test("every committed marketplace is allowlisted", () => {
  const committed = JSON.parse(
    readFileSync(
      resolve(import.meta.dirname, "../config/claude-marketplaces.registry.json"),
      "utf8",
    ),
  );
  for (const marketplace of committed.marketplaces)
    assert.match(manifestUrl(marketplace.repository), /^https:\/\/raw\.githubusercontent\.com\//);
});
