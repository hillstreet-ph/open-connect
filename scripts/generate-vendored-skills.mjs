#!/usr/bin/env node
// Generates the vendored skill catalog, static download packages, and the
// marketplace migration from config/vendored-skills.manifest.json.
// Metadata-only: nothing here installs or executes upstream code.
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join, relative, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(
  await readFile(resolve(root, "config/vendored-skills.manifest.json"), "utf8"),
);

const CLIENT_TARGETS = ["ChatGPT", "Claude", "Codex", "Open-Connect"];
const RESOURCE_TYPE = "skill";

function normalizeOpenSlug(value) {
  const body = value
    .trim()
    .toLowerCase()
    .replace(/^open[-_\s]+/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return `open-${body || "resource"}`;
}

function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) return {};
  const fields = {};
  for (const rawLine of match[1].split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, "");
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1].toLowerCase();
    let value = kv[2].trim();
    if (!value) continue;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    fields[key] = value;
  }
  return fields;
}

async function walkSkillDirs(base) {
  const results = [];
  async function visit(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (entries.some((entry) => entry.isFile() && entry.name === "SKILL.md")) {
      results.push(dir);
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== "node_modules") {
        await visit(join(dir, entry.name));
      }
    }
  }
  await visit(base);
  return results.sort();
}

async function pathExists(path) {
  return existsSync(path);
}

const resources = [];
const usedSlugs = new Map();
const warnings = [];

for (const source of manifest.sources) {
  const base = resolve(root, "skills/vendor", source.path);
  if (!(await pathExists(base))) {
    warnings.push(`missing vendored path for ${source.id}: skills/vendor/${source.path}`);
    continue;
  }
  const skillDirs = await walkSkillDirs(base);
  for (const dir of skillDirs) {
    const relPath = relative(base, dir).split(sep).join("/");
    const group = relPath.includes("/") ? relPath.split("/")[0] : "";
    const text = await readFile(join(dir, "SKILL.md"), "utf8");
    const fm = parseFrontmatter(text);
    const name = (fm.name || relPath.split("/").pop() || "").trim();
    if (!name) {
      warnings.push(`no name for ${source.id}/${relPath}`);
      continue;
    }
    let slug = normalizeOpenSlug(`${source.id}-${name}`);
    if (usedSlugs.has(slug)) {
      const count = usedSlugs.get(slug) + 1;
      usedSlugs.set(slug, count);
      slug = `${slug}-${count}`.slice(0, 80);
    } else {
      usedSlugs.set(slug, 1);
    }
    const rawLicense = (fm.license || "").trim();
    const license =
      rawLicense && /^(MIT|Apache|BSD|ISC|GPL|MPL|CC|Unlicense)/i.test(rawLicense)
        ? rawLicense
        : source.license;
    const category = source.group_categories?.[group] || source.category;
    const description = (fm.description || `${source.name} skill: ${name}.`).slice(0, 500);
    resources.push({
      slug,
      name,
      description,
      resource_type: RESOURCE_TYPE,
      category_slug: category,
      author: source.name,
      source: "vendored-upstream",
      source_url: source.repo,
      repository_url: source.repo,
      version: "1.0.0",
      license,
      installation_type: "skill-source",
      installation_config: {
        vendored_path: `skills/vendor/${source.path}/${relPath}`,
        upstream_repo: source.repo,
        requested: source.requested,
        review_state: "vendored_review_required",
        executable: false,
        ingestion_mode: "vendored_source",
        license_declared: rawLicense || null,
      },
      supported_clients: CLIENT_TARGETS,
      verified: false,
      featured: false,
      published: true,
      source_id: source.id,
      group: group || null,
      rel_path: relPath,
    });
  }
}

resources.sort((a, b) => a.slug.localeCompare(b.slug));

const catalog = {
  schema_version: "1.0.0",
  registry_id: "open-connect-vendored-skills",
  policy: {
    mode: "vendored_source",
    executable: false,
    install: false,
    publish: true,
    review_required: true,
  },
  generated_from: "config/vendored-skills.manifest.json",
  count: resources.length,
  resources,
};

await writeFile(
  resolve(root, "config/vendored-skills.generated.json"),
  `${JSON.stringify(catalog, null, 2)}\n`,
);

// Static download packages: one canonical SKILL.md per slug.
const downloadsRoot = resolve(root, "public/downloads/skills");
for (const resource of resources) {
  const target = resolve(downloadsRoot, resource.slug);
  await mkdir(target, { recursive: true });
  const original = await readFile(
    resolve(root, resource.installation_config.vendored_path, "SKILL.md"),
    "utf8",
  );
  await writeFile(resolve(target, "SKILL.md"), original);
}

function sqlEscape(value) {
  return String(value).replace(/'/g, "''");
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  return `'${sqlEscape(value)}'`;
}

const categorySlugs = [...new Set(resources.map((resource) => resource.category_slug))];
const categoryNames = {
  ai: ["AI", "AI agents, models, prompts, and automation"],
  browser: ["Browser", "Search, fetch, browser sessions, and web agents"],
  business: ["Business", "Business operations, CRM, finance, and collaboration"],
  communication: ["Communication", "Chat, email and notifications"],
  connections: ["Connections", "External applications, messaging, and identity integrations"],
  data: ["Data", "Databases, warehouses and analytics"],
  developer: ["Developer", "Coding, review and repository workflows"],
  infrastructure: ["Infrastructure", "Cloud, edge and deployment"],
  knowledge: ["Knowledge", "Memory, retrieval, indexing, and knowledge-management resources"],
  productivity: ["Productivity", "Docs, notes, tasks and scheduling"],
  security: ["Security", "Identity, credentials, auditing, and secure operations"],
};

const categoryValues = categorySlugs
  .map((slug) => {
    const [name, description] = categoryNames[slug] ?? [slug, null];
    return `  (${sqlLiteral(slug)}, ${sqlLiteral(name)}, ${sqlLiteral(description)})`;
  })
  .join(",\n");

const valueRows = resources
  .map((resource) => {
    const config = JSON.stringify(resource.installation_config);
    return `  (
    ${sqlLiteral(resource.slug)}, ${sqlLiteral(resource.name)}, ${sqlLiteral(resource.description)},
    ${sqlLiteral(resource.resource_type)}, ${sqlLiteral(resource.category_slug)}, ${sqlLiteral(resource.author)},
    ${sqlLiteral(resource.source)}, ${sqlLiteral(resource.source_url)}, ${sqlLiteral(resource.repository_url)},
    ${sqlLiteral(resource.version)}, ${sqlLiteral(resource.license)}, ${sqlLiteral(resource.installation_type)},
    ${sqlLiteral(config)}::jsonb,
    array[${resource.supported_clients.map(sqlLiteral).join(",")}],
    false, false, true
  )`;
  })
  .join(",\n");

const migration = `-- Vendored upstream agent skills from OpenHands/extensions, OpenHands/OpenHands
-- (.agents/skills, also served by OpenHands/openhands), master-kanor/manus-skills,
-- and openclaw/openclaw. Metadata only: nothing here installs or executes upstream code.
-- Generated by scripts/generate-vendored-skills.mjs — do not edit by hand.

insert into public.categories (slug, name, description) values
${categoryValues}
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description;

insert into public.resources (
  slug, name, description, resource_type, category_slug, author, source,
  source_url, repository_url, version, license, installation_type, installation_config,
  supported_clients, verified, featured, published
) values
${valueRows}
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  resource_type = excluded.resource_type,
  category_slug = excluded.category_slug,
  author = excluded.author,
  source = excluded.source,
  source_url = excluded.source_url,
  repository_url = excluded.repository_url,
  version = excluded.version,
  license = excluded.license,
  installation_type = excluded.installation_type,
  installation_config = excluded.installation_config,
  supported_clients = excluded.supported_clients,
  verified = false,
  featured = false,
  published = true,
  updated_at = now();
`;

await writeFile(
  resolve(root, "supabase/migrations/20261006000000_vendored_upstream_skills.sql"),
  migration,
);

console.log(
  JSON.stringify(
    { resources: resources.length, categories: categorySlugs.length, warnings },
    null,
    2,
  ),
);
