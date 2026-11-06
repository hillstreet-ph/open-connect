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

test("platform collection surfaces the upstream IP restriction without retrying or falling back", async () => {
  const { collectPlatformSource } = await import("./agent-platform-discovery.mjs");
  const requests = [];
  await assert.rejects(
    () =>
      collectPlatformSource(
        { id: "mistral-vibe-resources", repository: "mistralai/mistral-vibe" },
        {
          headers: { Authorization: "Bearer fixture-token" },
          fetch: async (url, options) => {
            requests.push({ url, options });
            return requests.length === 1
              ? Response.json({ ...repo, full_name: "mistralai/mistral-vibe" })
              : Response.json(
                  {
                    message: "Organization IP allow list blocks this runner.",
                    unrelated: "private-sentinel",
                  },
                  { status: 403 },
                );
          },
        },
      ),
    (error) => {
      assert.match(error.message, /mistral-vibe-resources.*HTTP 403.*Organization IP allow list/);
      assert.doesNotMatch(error.message, /fixture-token|private-sentinel/);
      return true;
    },
  );
  assert.equal(requests.length, 2);
  assert.equal(
    requests[1].url,
    "https://api.github.com/repos/mistralai/mistral-vibe/git/trees/main?recursive=1",
  );
  assert.equal(requests[1].options.redirect, "error");
});

test("platform collection validates the complete tree before yielding review candidates", async () => {
  const { collectPlatformSource } = await import("./agent-platform-discovery.mjs");
  const source = {
    id: "openai-agent-skills",
    repository: "openai/skills",
    trust: "official_upstream",
  };
  const responses = [Response.json(repo), Response.json(tree)];
  const rows = await collectPlatformSource(source, { fetch: async () => responses.shift() });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].reviewState, "pending_license_review");
  assert.equal(rows[0].metadata.blob_sha, "blob1");
  const truncated = [Response.json(repo), Response.json({ ...tree, truncated: true })];
  await assert.rejects(
    () => collectPlatformSource(source, { fetch: async () => truncated.shift() }),
    /incomplete/,
  );
});
