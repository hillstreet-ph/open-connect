import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { hasSecret, parseFrontmatter, validateCatalog } from "./sync-claude-library.mjs";

const script = resolve(import.meta.dirname, "sync-claude-library.mjs");
const committed = resolve(import.meta.dirname, "../config/claude-library.catalog.json");

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
  mkdirSync(join(skills, "github-e2e-setup"), { recursive: true });
  writeFileSync(join(skills, "github-e2e-setup", "SKILL.md"), "---\nname: github-e2e-setup\n---\n");
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
    JSON.stringify({ resources: [{ slug: "github-e2e-setup", type: "skill" }] }),
  );
  return { base, skills, plugins, library, out: join(base, "catalog.json") };
}

test("parses folded frontmatter", () => {
  const fm = parseFrontmatter("---\nname: x\ndescription: >\n  a\n  b\n---\n");
  assert.equal(fm.description, "a b");
});

test("detects secret-like values", () => {
  assert.equal(hasSecret(`ghp_${"a".repeat(36)}`), true);
  assert.equal(hasSecret("plain text"), false);
});

test("builds a metadata-only catalog with license, dedupe and quarantine", () => {
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
  const catalog = JSON.parse(readFileSync(f.out, "utf8"));
  assert.deepEqual(validateCatalog(catalog), []);
  assert.equal(catalog.counts.account_skills, 3);
  assert.equal(catalog.counts.plugins, 1);
  const bySlug = Object.fromEntries(catalog.resources.map((r) => [r.slug, r]));
  assert.equal(bySlug["claude-skill-alpha"].description, "Folded description over lines.");
  assert.equal(bySlug["claude-skill-alpha"].license, "MIT");
  assert.equal(bySlug["claude-skill-leaky"].review_state, "quarantined_metadata");
  assert.equal(bySlug["claude-skill-github-e2e-setup"].duplicate_of, "github-e2e-setup");
  assert.equal(bySlug["claude-plugin-beta"].license, "Apache-2.0");
  assert.equal(bySlug["claude-plugin-beta"].marketplace, "test-market");
  assert.deepEqual(bySlug["claude-plugin-beta"].skills, ["one"]);
  assert.ok(!readFileSync(f.out, "utf8").includes("AKIA"));
});

test("committed catalog is valid and within the library upload limit", () => {
  const text = readFileSync(committed, "utf8");
  assert.ok(Buffer.byteLength(text) <= 256 * 1024);
  assert.deepEqual(validateCatalog(JSON.parse(text)), []);
});
