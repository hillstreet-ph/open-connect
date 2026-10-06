#!/usr/bin/env node
// Validates the vendored upstream skill catalog against the manifest and the
// vendored source tree. Metadata-only: it never installs or executes upstream code.
import { readFile, stat } from "node:fs/promises";
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
const allowedLicenses = /^(MIT|Apache|BSD|ISC|GPL|MPL|CC|Unlicense)/i;

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
  const config = resource.installation_config || {};
  if (config.executable !== false || config.ingestion_mode !== "vendored_source") {
    throw new Error(`unsafe installation config for ${resource.slug}`);
  }
  const skillPath = resolve(root, config.vendored_path, "SKILL.md");
  try {
    const info = await stat(skillPath);
    if (!info.isFile()) throw new Error("not a file");
  } catch {
    throw new Error(`missing vendored SKILL.md for ${resource.slug}: ${config.vendored_path}`);
  }
  if (!allowedCategories.has(resource.category_slug) && resource.category_slug !== "connections") {
    throw new Error(`unexpected category for ${resource.slug}: ${resource.category_slug}`);
  }
}

console.log(
  JSON.stringify({
    ok: true,
    resources: catalog.resources.length,
    sources: sourceIds.size,
    categories: [...new Set(catalog.resources.map((r) => r.category_slug))].sort(),
  }),
);
