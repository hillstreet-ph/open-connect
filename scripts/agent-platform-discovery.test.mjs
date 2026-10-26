import assert from "node:assert/strict";
import test from "node:test";
import {
  platformCandidates,
  mergePlatformSnapshot,
  deduplicatePlatformCandidates,
  platformEndpoint,
} from "./agent-platform-discovery.mjs";

const source = { id: "example", trust: "owned_source", categories: ["agents"] };
const repo = {
  id: 123,
  name: "resources",
  full_name: "owner/resources",
  default_branch: "main",
  license: { spdx_id: "MIT" },
};
const tree = {
  sha: "tree1",
  tree: [
    { type: "blob", path: "skills/review/SKILL.md", sha: "blob1" },
    { type: "blob", path: "plugins/test/.claude-plugin/plugin.json", sha: "blob2" },
    { type: "blob", path: "node_modules/pkg/SKILL.md", sha: "ignored" },
    { type: "blob", path: "secrets.env", sha: "ignored" },
  ],
};

test("platform fetch endpoints reject registry-controlled host and path changes", () => {
  assert.equal(
    platformEndpoint({ id: "openai-agent-skills", repository: "openai/skills" }),
    "https://api.github.com/repos/openai/skills",
  );
  for (const repository of [
    "../user",
    "evil/repo",
    "openai/skills?x=1",
    "openai/skills/../../user",
  ]) {
    assert.throws(
      () => platformEndpoint({ id: "openai-agent-skills", repository }),
      /not an approved/,
    );
  }
  assert.throws(
    () => platformEndpoint({ id: "new-unreviewed", repository: "openai/skills" }),
    /not an approved/,
  );
});

test("only resource manifests are discovered, never trusted or installed", () => {
  const rows = platformCandidates(source, repo, tree);
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((r) => r.metadata.resource_type),
    ["skill", "plugin"],
  );
  for (const row of rows) {
    assert.equal(row.reviewState, "pending_license_review");
    assert.equal(row.metadata.ingestion_mode, "metadata_only");
    assert.equal(row.metadata.license_scope, "repository_only_unreviewed");
    assert.ok(!("verified" in row));
  }
});

test("source identity stays stable across content revisions and names are unique", () => {
  const first = platformCandidates(source, repo, tree);
  const next = platformCandidates(source, repo, {
    ...tree,
    sha: "tree2",
    tree: tree.tree.map((r) => ({ ...r, sha: "new" })),
  });
  assert.deepEqual(
    first.map((r) => r.slug),
    next.map((r) => r.slug),
  );
  assert.notEqual(first[0].revision, next[0].revision);
  assert.notEqual(first[0].slug, first[1].slug);
});

test("incomplete, empty, oversized or archived snapshots fail closed", () => {
  assert.throws(() => platformCandidates(source, repo, { ...tree, truncated: true }), /incomplete/);
  assert.throws(() => platformCandidates(source, repo, { sha: "x", tree: [] }), /no resource/);
  assert.throws(() => platformCandidates({ ...source, max_items: 1 }, repo, tree), /limit/);
  assert.throws(() => platformCandidates(source, { ...repo, archived: true }, tree), /archived/);
});

test("hourly refresh replaces selected sources and preserves unrelated snapshots", () => {
  assert.deepEqual(
    mergePlatformSnapshot(
      [
        { sourceId: "unrelated", externalId: "retained" },
        { sourceId: "example", externalId: "old" },
      ],
      [{ sourceId: "example", externalId: "new" }],
      ["example"],
    ),
    [
      { sourceId: "unrelated", externalId: "retained" },
      { sourceId: "example", externalId: "new" },
    ],
  );
});

test("identical fork manifests collapse to upstream with both source references", () => {
  const fork = platformCandidates(source, repo, tree);
  const upstream = platformCandidates(
    { ...source, id: "official", trust: "official_upstream" },
    { ...repo, id: 456, full_name: "upstream/resources" },
    tree,
  );
  const rows = deduplicatePlatformCandidates([...fork, ...upstream]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].sourceId, "official");
  assert.equal(rows[0].metadata.source_aliases.length, 2);
  assert.equal(deduplicatePlatformCandidates([...upstream, ...fork])[0].sourceId, "official");
  assert.equal(deduplicatePlatformCandidates([{ sourceId: "other" }, ...fork]).length, 3);
});
