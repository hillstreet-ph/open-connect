#!/usr/bin/env node
// Validates the vendored upstream skill catalog against the manifest and the
// vendored source tree. Metadata-only: it never installs or executes upstream code.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(
  await readFile(resolve(root, "config/vendored-skills.manifest.json"), "utf8"),
);
const catalog = JSON.parse(
  await readFile(resolve(root, "config/vendored-skills.generated.json"), "utf8"),
);

if (catalog.policy?.executable !== false || catalog.policy?.install !== false) {
  throw new Error("vendored catalog must remain non-executable and non-installing");
}
if (catalog.count !== catalog.resources.length) {
  throw new Error(`catalog count ${catalog.count} does not match ${catalog.resources.length}`);
}

const sourceIds = new Set(manifest.sources.map((source) => source.id));
const allowedCategories = new Set();
for (const source of manifest.sources) {
  allowedCategories.add(source.category);
  for (const value of Object.values(source.group_categories ?? {})) {
    allowedCategories.add(value);
  }
}
allowedCategories.add("connections");
const slugs = new Set();
const contentHashes = new Map();
const allowedLicenses = /^(MIT|Apache|BSD|ISC|GPL|MPL|CC|Unlicense)/i;
const semver = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

for (const resource of catalog.resources) {
  if (!sourceIds.has(resource.source_id)) {
    throw new Error(`unknown source: ${resource.source_id}`);
  }
  if (!slugs.has(resource.slug)) slugs.add(resource.slug);
  else throw new Error(`duplicate slug: ${resource.slug}`);
  if (resource.resource_type !== "skill") {
    throw new Error(`unexpected resource type: ${resource.slug}`);
  }
  if (!resource.license || !allowedLicenses.test(resource.license)) {
    throw new Error(`missing or unaccepted license for ${resource.slug}: ${resource.license}`);
  }
  if (!resource.version || !semver.test(resource.version)) {
    throw new Error(`missing or non-semver version for ${resource.slug}: ${resource.version}`);
  }
  // A slug ending in "-<n>" is only a collision artifact when the same slug
  // without the suffix is also present; upstream names such as "claude-3" are
  // legitimate. Slug uniqueness is enforced separately above.
  const suffix = /-([0-9]+)$/.exec(resource.slug);
  if (suffix && slugs.has(resource.slug.slice(0, -suffix[0].length))) {
    throw new Error(`slug carries an unresolved collision suffix: ${resource.slug}`);
  }
  const config = resource.installation_config || {};
  if (config.executable !== false || config.ingestion_mode !== "vendored_source") {
    throw new Error(`unsafe installation config for ${resource.slug}`);
  }
  if (!config.content_hash || !/^[a-f0-9]{64}$/.test(config.content_hash)) {
    throw new Error(`missing content hash for ${resource.slug}`);
  }
  if (!config.upstream_commit) {
    throw new Error(`missing pinned upstream commit for ${resource.slug}`);
  }
  // Identical content must have been collapsed to a single canonical entry.
  const priorSlug = contentHashes.get(config.content_hash);
  if (priorSlug) {
    throw new Error(`duplicate content not deduped: ${resource.slug} and ${priorSlug}`);
  }
  contentHashes.set(config.content_hash, resource.slug);
  const skillPath = resolve(root, config.vendored_path, "SKILL.md");
  let skillText;
  try {
    // readFile throws for a missing path or a directory, so no separate stat is
    // needed and the content cannot change between a check and the read.
    skillText = await readFile(skillPath, "utf8");
  } catch {
    throw new Error(`missing vendored SKILL.md for ${resource.slug}: ${config.vendored_path}`);
  }
  // The catalog hash is the revision marker, so verify it against the file
  // itself. Otherwise edited vendored content would keep its old version.
  const recomputed = createHash("sha256").update(skillText).digest("hex");
  if (recomputed !== config.content_hash) {
    throw new Error(
      `content hash does not match vendored file for ${resource.slug}: ` +
        `catalog ${config.content_hash}, file ${recomputed}`,
    );
  }
  if (!allowedCategories.has(resource.category_slug) && resource.category_slug !== "connections") {
    throw new Error(`unexpected category for ${resource.slug}: ${resource.category_slug}`);
  }
}

const duplicates = catalog.duplicates ?? [];
if ((catalog.duplicate_count ?? 0) !== duplicates.length) {
  throw new Error(
    `duplicate_count ${catalog.duplicate_count} does not match ${duplicates.length} records`,
  );
}
for (const record of duplicates) {
  if (!slugs.has(record.canonical_slug)) {
    throw new Error(`duplicate record points at unknown canonical slug: ${record.canonical_slug}`);
  }
  const canonical = catalog.resources.find((entry) => entry.slug === record.canonical_slug);
  const config = canonical.installation_config;

  if (record.reason === "identical_content") {
    // Cross-repository duplicates: the dropped slug must be gone from the
    // catalog and preserved as an alias carrying the same content.
    if (slugs.has(record.duplicate_slug)) {
      throw new Error(`dropped duplicate still present in catalog: ${record.duplicate_slug}`);
    }
    const aliases = config.aliases ?? [];
    if (!aliases.some((alias) => alias.slug === record.duplicate_slug)) {
      throw new Error(`dropped duplicate not recorded as alias: ${record.duplicate_slug}`);
    }
    if (config.content_hash !== record.content_hash) {
      throw new Error(`alias content hash mismatch for ${record.canonical_slug}`);
    }
    continue;
  }

  if (record.reason === "superseded_revision") {
    // Same skill name and repository in two directories: the dropped revision is
    // identified by path, because the slug is shared with the canonical entry.
    const lineage = config.superseded ?? [];
    if (!lineage.some((entry) => entry.id === record.duplicate_slug)) {
      throw new Error(`superseded revision not recorded as lineage: ${record.duplicate_slug}`);
    }
    if (record.content_hash === record.canonical_content_hash) {
      throw new Error(`superseded revision is identical content: ${record.duplicate_slug}`);
    }
    continue;
  }

  throw new Error(`unknown duplicate reason: ${record.reason}`);
}

console.log(
  JSON.stringify({
    ok: true,
    resources: catalog.resources.length,
    duplicates: duplicates.length,
    sources: sourceIds.size,
    categories: [...new Set(catalog.resources.map((r) => r.category_slug))].sort(),
  }),
);
