import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import {
  REQUIRED_POLICY,
  SHARD_BYTES,
  dedupeSlugs,
  hasSecret,
  parseFrontmatter,
  readCatalog,
  serializeCatalog,
  slugBody,
  validateCatalog,
} from "./sync-claude-library.mjs";

const script = resolve(import.meta.dirname, "sync-claude-library.mjs");
const committed = resolve(import.meta.dirname, "../config/claude-library");

function fixture() {
  const base = mkdtempSync(join(tmpdir(), "claude-lib-"));
  const skills = join(base, "skills");
  const plugins = join(base, "plugins");
  mkdirSync(join(skills, "alpha"), { recursive: true });
  writeFileSync(
    join(skills, "alpha", "SKILL.md"),
    "---\nname: alpha\ndescription: >\n  Folded description\n  over lines.\nlicense: MIT\n---\nBody\n",
  );
  mkdirSync(join(skills, "leaky"), { recursive: true });
  writeFileSync(
    join(skills, "leaky", "SKILL.md"),
    `---\nname: leaky\ndescription: has key\n---\nAKIA${"A".repeat(16)}\n`,
  );
  mkdirSync(join(skills, "helper-leak", "scripts"), { recursive: true });
  writeFileSync(join(skills, "helper-leak", "SKILL.md"), "---\nname: helper-leak\n---\n");
  writeFileSync(join(skills, "helper-leak", "scripts", "run.sh"), `TOKEN=ghp_${"b".repeat(36)}\n`);
  mkdirSync(join(skills, "github-e2e-setup"), { recursive: true });
  writeFileSync(join(skills, "github-e2e-setup", "SKILL.md"), "---\nname: github-e2e-setup\n---\n");
  mkdirSync(join(skills, "web-search"), { recursive: true });
  writeFileSync(join(skills, "web-search", "SKILL.md"), "---\nname: web-search\n---\n");
  mkdirSync(join(skills, "nihongo"), { recursive: true });
  writeFileSync(join(skills, "nihongo", "SKILL.md"), "---\nname: 日本語\n---\n");
  const plugin = join(plugins, "beta");
  mkdirSync(join(plugin, ".claude-plugin"), { recursive: true });
  mkdirSync(join(plugin, "skills", "one"), { recursive: true });
  writeFileSync(
    join(plugin, ".claude-plugin", "plugin.json"),
    JSON.stringify({ name: "beta", version: "1.0.0", description: "Beta plugin" }),
  );
  writeFileSync(join(plugin, "skills", "one", "SKILL.md"), "---\nname: one\n---\n");
  writeFileSync(join(plugin, "LICENSE"), "Apache License\nVersion 2.0");
  writeFileSync(
    join(plugins, "beta.meta.json"),
    JSON.stringify({ marketplace_name: "test-market", installation_preference: "available" }),
  );
  const library = join(base, "library.json");
  writeFileSync(
    library,
    JSON.stringify({
      resources: [
        { slug: "github-e2e-setup", name: "GitHub E2E Setup", type: "skill" },
        { slug: "web-search-tool", name: "Web Search Tool", type: "tool" },
        { slug: "alpha-skill-x9z1", name: "Alpha", type: "skill" },
      ],
    }),
  );
  return { base, skills, plugins, library, out: join(base, "catalog") };
}

function run(f, extra = []) {
  return spawnSync(
    process.execPath,
    [script, "--skills", f.skills, "--plugins", f.plugins, "--out", f.out, ...extra],
    { encoding: "utf8" },
  );
}

test("parses folded frontmatter", () => {
  const fm = parseFrontmatter("---\nname: x\ndescription: >\n  a\n  b\n---\n");
  assert.equal(fm.description, "a b");
});

test("detects secret-like values", () => {
  assert.equal(hasSecret(`ghp_${"a".repeat(36)}`), true);
  assert.equal(hasSecret("plain text"), false);
});

test("builds a metadata-only catalog with license, dedupe, fingerprint and quarantine", async () => {
  const f = fixture();
  execFileSync(process.execPath, [
    script,
    "--skills",
    f.skills,
    "--plugins",
    f.plugins,
    "--library",
    f.library,
    "--out",
    f.out,
  ]);
  const catalog = await readCatalog(f.out);
  assert.deepEqual(validateCatalog(catalog), []);
  assert.equal(catalog.counts.account_skills, 6);
  assert.equal(catalog.counts.plugins, 1);
  const bySlug = Object.fromEntries(catalog.resources.map((r) => [r.slug, r]));
  assert.equal(bySlug["claude-skill-alpha"].description, "Folded description over lines.");
  assert.equal(bySlug["claude-skill-alpha"].license, "MIT");
  assert.equal(bySlug["claude-skill-alpha"].duplicate_of, "alpha-skill-x9z1");
  assert.equal(bySlug["claude-skill-leaky"].review_state, "quarantined_metadata");
  assert.equal(bySlug["claude-skill-helper-leak"].review_state, "quarantined_metadata");
  assert.equal(bySlug["claude-skill-github-e2e-setup"].duplicate_of, "github-e2e-setup");
  assert.equal(bySlug["claude-skill-web-search"].duplicate_of, undefined);
  assert.ok(bySlug["claude-skill-nihongo"], "non-ASCII name falls back to directory slug");
  assert.equal(bySlug["claude-plugin-beta"].license, "Apache-2.0");
  assert.equal(bySlug["claude-plugin-beta"].marketplace, "test-market");
  assert.match(bySlug["claude-plugin-beta"].sha256, /^[a-f0-9]{16}$/);
  assert.deepEqual(bySlug["claude-plugin-beta"].skills, ["one"]);
  for (const name of readdirSync(f.out)) {
    assert.match(name, /\.generated\.json$/);
    const text = readFileSync(join(f.out, name), "utf8");
    assert.ok(!text.includes("AKIA") && !text.includes("ghp_"));
  }
});

test("aborts on a missing or invalid library snapshot", () => {
  const f = fixture();
  const missing = run(f, ["--library", join(f.base, "absent.json")]);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /library snapshot missing or invalid/);
  writeFileSync(join(f.base, "bad.json"), "{not json");
  assert.notEqual(run(f, ["--library", join(f.base, "bad.json")]).status, 0);
});

test("rejects any policy that permits install, publish, or skipped review", () => {
  const base = { schema_version: "1.0.0", counts: { total: 0 }, resources: [] };
  assert.deepEqual(validateCatalog({ ...base, policy: { ...REQUIRED_POLICY } }), []);
  for (const [key, value] of [
    ["mode", "vendored"],
    ["auto_install", true],
    ["auto_publish", true],
    ["require_security_review", false],
  ]) {
    const errors = validateCatalog({ ...base, policy: { ...REQUIRED_POLICY, [key]: value } });
    assert.ok(
      errors.some((e) => e.startsWith(`policy.${key}`)),
      key,
    );
  }
});

test("dedupes slugs against every assigned slug", () => {
  const records = [
    { slug: "claude-skill-dup" },
    { slug: "claude-skill-dup" },
    { slug: "claude-skill-dup-2" },
    { slug: `claude-skill-${"a".repeat(67)}` },
    { slug: `claude-skill-${"a".repeat(67)}` },
  ];
  const slugs = dedupeSlugs(records).map((r) => r.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  assert.ok(slugs.every((s) => s.length <= 80));
  assert.equal(slugBody("日本語", "", ""), slugBody("日本語", "", ""));
  assert.match(slugBody("日本語"), /^x[a-f0-9]{12}$/);
});

test("shards stay within SHARD_BYTES measured in UTF-8 bytes", () => {
  const resources = Array.from({ length: 300 }, (_, i) => ({
    slug: `claude-skill-s${i}`,
    review_state: "pending_security_review",
    description: "多言語の説明文".repeat(20),
  }));
  const files = serializeCatalog({ policy: REQUIRED_POLICY, resources });
  for (const [name, text] of Object.entries(files)) {
    if (name.startsWith("resources-")) assert.ok(Buffer.byteLength(text) <= SHARD_BYTES, name);
  }
});

test("committed catalog is valid and every shard stays within the byte limit", async () => {
  const catalog = await readCatalog(committed);
  assert.ok(catalog, "committed catalog index missing");
  assert.deepEqual(validateCatalog(catalog), []);
  for (const name of catalog.shards) {
    assert.match(name, /\.generated\.json$/);
    assert.ok(statSync(join(committed, name)).size <= SHARD_BYTES, name);
  }
});
