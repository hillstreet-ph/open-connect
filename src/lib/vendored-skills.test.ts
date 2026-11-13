import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../..");

function readJson(path: string) {
  return JSON.parse(readFileSync(resolve(root, path), "utf8"));
}

test("vendored skills manifest covers every requested upstream repository", () => {
  const manifest = readJson("config/vendored-skills.manifest.json") as {
    sources: Array<{
      id: string;
      repo: string;
      requested: string;
      also_at?: string;
      license: string;
    }>;
  };
  const repos = new Set(manifest.sources.map((source) => source.repo));
  for (const expected of [
    "https://github.com/OpenHands/extensions",
    "https://github.com/OpenHands/OpenHands",
    "https://github.com/master-kanor/manus-skills",
    "https://github.com/openclaw/openclaw",
  ]) {
    assert.ok(repos.has(expected), `missing vendored source ${expected}`);
  }
  assert.ok(
    manifest.sources.some((source) => source.also_at?.includes("OpenHands/openhands")),
    "OpenHands/openhands alias must be recorded",
  );
  assert.ok(manifest.sources.every((source) => source.license === "MIT"));
});

test("vendored skill catalog is metadata-only with unique open slugs", () => {
  const catalog = readJson("config/vendored-skills.generated.json") as {
    policy: { executable: boolean; install: boolean };
    count: number;
    resources: Array<{
      slug: string;
      license: string | null;
      category_slug: string;
      installation_config: { executable: boolean; vendored_path: string };
    }>;
  };
  assert.equal(catalog.policy.executable, false);
  assert.equal(catalog.policy.install, false);
  assert.equal(catalog.count, catalog.resources.length);
  assert.ok(catalog.resources.length >= 200, "expected a substantial vendored catalog");

  const slugs = new Set<string>();
  for (const resource of catalog.resources) {
    assert.ok(resource.slug.startsWith("open-"), `slug must be open-prefixed: ${resource.slug}`);
    assert.ok(!slugs.has(resource.slug), `duplicate slug: ${resource.slug}`);
    slugs.add(resource.slug);
    assert.ok(resource.license, `missing license for ${resource.slug}`);
    assert.equal(resource.installation_config.executable, false);
    assert.ok(
      existsSync(resolve(root, resource.installation_config.vendored_path, "SKILL.md")),
      `missing vendored source for ${resource.slug}`,
    );
    assert.ok(
      existsSync(resolve(root, "public/downloads/skills", resource.slug, "SKILL.md")),
      `missing download package for ${resource.slug}`,
    );
  }
});

test("vendored catalog records version and upstream provenance for every skill", () => {
  const catalog = readJson("config/vendored-skills.generated.json") as {
    resources: Array<{
      slug: string;
      version: string;
      installation_config: {
        content_hash: string;
        upstream_commit: string | null;
        upstream_ref: string;
        aliases?: unknown[];
        superseded?: unknown[];
      };
    }>;
  };
  const semver = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
  const hashes = new Map<string, string>();
  for (const resource of catalog.resources) {
    const config = resource.installation_config;
    assert.match(resource.version, semver, `non-semver version for ${resource.slug}`);
    assert.match(config.content_hash, /^[a-f0-9]{64}$/, `bad hash for ${resource.slug}`);
    assert.ok(config.upstream_commit, `missing upstream commit for ${resource.slug}`);
    assert.ok(config.upstream_ref, `missing upstream ref for ${resource.slug}`);
    const prior = hashes.get(config.content_hash);
    assert.equal(prior, undefined, `content duplicated across ${resource.slug} and ${prior}`);
    hashes.set(config.content_hash, resource.slug);
  }
});

test("vendored catalog resolves duplicate content and superseded revisions", () => {
  const catalog = readJson("config/vendored-skills.generated.json") as {
    duplicate_count: number;
    duplicates: Array<{
      reason: string;
      canonical_slug: string;
      duplicate_slug: string;
      content_hash: string;
      canonical_content_hash: string;
    }>;
    resources: Array<{
      slug: string;
      installation_config: {
        content_hash: string;
        aliases?: Array<{ slug: string; content_hash: string }>;
        superseded?: Array<{ id: string; content_hash: string; rel_path: string }>;
      };
    }>;
  };
  assert.equal(catalog.duplicate_count, catalog.duplicates.length);

  const bySlug = new Map(catalog.resources.map((r) => [r.slug, r]));
  const reasons = new Set(catalog.duplicates.map((d) => d.reason));
  for (const reason of reasons) {
    assert.ok(
      ["identical_content", "superseded_revision"].includes(reason),
      `unexpected duplicate reason: ${reason}`,
    );
  }

  for (const record of catalog.duplicates) {
    const canonical = bySlug.get(record.canonical_slug);
    assert.ok(canonical, `missing canonical entry ${record.canonical_slug}`);
    const config = canonical.installation_config;
    if (record.reason === "identical_content") {
      assert.ok(
        (config.aliases ?? []).some(
          (alias) =>
            alias.slug === record.duplicate_slug && alias.content_hash === record.content_hash,
        ),
        `alias not recorded for ${record.duplicate_slug}`,
      );
      assert.ok(
        !bySlug.has(record.duplicate_slug),
        `dropped duplicate still present: ${record.duplicate_slug}`,
      );
    } else {
      assert.ok(
        (config.superseded ?? []).some(
          (entry) =>
            entry.id === record.duplicate_slug && entry.content_hash === record.content_hash,
        ),
        `superseded lineage not recorded for ${record.duplicate_slug}`,
      );
      assert.notEqual(
        record.content_hash,
        record.canonical_content_hash,
        `superseded revision should not be identical content: ${record.duplicate_slug}`,
      );
    }
  }
});

test("no vendored slug carries an unresolved collision suffix", () => {
  const catalog = readJson("config/vendored-skills.generated.json") as {
    resources: Array<{ slug: string }>;
  };
  const slugs = new Set(catalog.resources.map((resource) => resource.slug));
  for (const resource of catalog.resources) {
    // A trailing "-<n>" is only a collision artifact when the un-suffixed slug
    // is also taken; upstream names such as "claude-3" are legitimate.
    const suffix = /-([0-9]+)$/.exec(resource.slug);
    if (!suffix) continue;
    const base = resource.slug.slice(0, -suffix[0].length);
    assert.ok(!slugs.has(base), `slug carries an unresolved collision suffix: ${resource.slug}`);
  }
});

test("every retired vendored slug maps to a canonical replacement", () => {
  const manifest = readJson("config/vendored-skills.manifest.json") as {
    dedupe_renames?: Array<{ from: string; to: string; reason: string }>;
  };
  const catalog = readJson("config/vendored-skills.generated.json") as {
    resources: Array<{ slug: string }>;
    duplicates: Array<{ canonical_slug: string; duplicate_slug: string; reason: string }>;
  };
  const slugs = new Set(catalog.resources.map((resource) => resource.slug));
  const renames = manifest.dedupe_renames ?? [];
  assert.ok(renames.length > 0, "expected dedupe_renames to record retired slugs");

  for (const rename of renames) {
    assert.ok(slugs.has(rename.to), `rename target missing from catalog: ${rename.to}`);
    assert.ok(!slugs.has(rename.from), `retired slug still in catalog: ${rename.from}`);
    // The duplicate record identifies a superseded revision by vendored path
    // rather than by the retired slug, so match on the canonical entry and the
    // reason instead of the dropped identifier.
    assert.ok(
      catalog.duplicates.some(
        (record) => record.canonical_slug === rename.to && record.reason === rename.reason,
      ),
      `retired slug ${rename.from} has no ${rename.reason} duplicate for ${rename.to}`,
    );
  }
});

test("generated migrations re-point references before retiring duplicates", () => {
  const renameMigration = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20261006010000_vendored_skill_dedupe_renames.sql"),
    "utf8",
  );
  // Foreign keys on resources(id) cascade, so a delete before the re-point would
  // silently drop saved toolkit items, project resources and installations.
  for (const table of ["toolkit_items", "project_resources", "capability_installations"]) {
    assert.match(
      renameMigration,
      new RegExp(`update public\\.${table} as item`),
      `missing reference re-point for ${table}`,
    );
  }
  const repointIndex = renameMigration.indexOf("update public.toolkit_items");
  const deleteIndex = renameMigration.indexOf("delete from public.resources");
  assert.ok(repointIndex >= 0 && deleteIndex > repointIndex, "delete must follow the re-points");

  // The base migration must not prune: it runs before the re-point migration.
  const baseMigration = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20261006000000_vendored_upstream_skills.sql"),
    "utf8",
  );
  assert.doesNotMatch(
    baseMigration,
    /delete from public\.resources/,
    "base migration must not delete rows before references are re-pointed",
  );
});

test("vendored sources contain no executable upstream code", () => {
  const manifest = readJson("config/vendored-skills.manifest.json") as {
    policy: { excluded_extensions: string[]; excluded_executables: string };
    sources: Array<{ path: string }>;
  };
  const scriptExtensions = new Set([
    ".py",
    ".js",
    ".mjs",
    ".cjs",
    ".ts",
    ".tsx",
    ".jsx",
    ".sh",
    ".bash",
    ".ps1",
  ]);
  const walk = (dir: string): string[] => {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) out.push(...walk(full));
      else if (entry.isFile()) out.push(full);
    }
    return out;
  };
  for (const source of manifest.sources) {
    for (const file of walk(resolve(root, "skills/vendor", source.path))) {
      const ext = file.slice(file.lastIndexOf(".")).toLowerCase();
      assert.ok(!scriptExtensions.has(ext), `executable upstream file vendored: ${file}`);
      assert.notEqual(
        readFileSync(file).subarray(0, 2).toString(),
        "#!",
        `shebang executable vendored: ${file}`,
      );
    }
  }
});

test("vendored upstream repositories are registered as marketplace sources", () => {
  const registry = readJson("config/marketplace-sources.registry.json") as {
    sources: Array<{ id: string; trust: string; catalog_url?: string }>;
  };
  const ids = new Set(registry.sources.map((source) => source.id));
  for (const id of [
    "openhands-extensions-skills",
    "openhands-core-skills",
    "manus-skills",
    "openclaw-skills",
  ]) {
    assert.ok(ids.has(id), `missing marketplace source ${id}`);
  }
  const capability = readJson("config/capability-sources.registry.json") as {
    sources: Array<{ id: string; vendored_path?: string; install_policy?: string }>;
  };
  for (const source of capability.sources.filter((entry) => entry.vendored_path)) {
    assert.equal(source.install_policy, "metadata_only_review_required");
    assert.ok(existsSync(resolve(root, source.vendored_path!)), `missing ${source.vendored_path}`);
  }
});
