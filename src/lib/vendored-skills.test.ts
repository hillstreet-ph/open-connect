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
