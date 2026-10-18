#!/usr/bin/env node
// Generates the vendored skill catalog, static download packages, and the
// marketplace migration from config/vendored-skills.manifest.json.
// Metadata-only: nothing here installs or executes upstream code.
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, join, relative, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(
  await readFile(resolve(root, "config/vendored-skills.manifest.json"), "utf8"),
);

const CLIENT_TARGETS = ["ChatGPT", "Claude", "Codex", "Open-Connect"];
const RESOURCE_TYPE = "skill";

// Official first-party sources win when the same skill content is vendored from
// more than one repository.
const TRUST_RANK = { official_first_party: 0, verified_community: 1 };

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function isSemver(value) {
  return /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(value);
}

// Upstream frontmatter is inconsistent, so a declared version is trusted only
// when it is real semver; otherwise the content hash carries the revision.
function resolveVersion(declared, hash) {
  return isSemver(declared) ? declared : `1.0.0+${hash.slice(0, 8)}`;
}

// Two vendored skills are the same skill when they declare the same name within
// the same upstream repository. The identity deliberately excludes the
// directory, because upstream reorganises folders without renaming skills.
function skillIdentity(repositoryUrl, name) {
  return `${repositoryUrl.replace(/\/+$/, "").toLowerCase()}::${name.trim().toLowerCase()}`;
}

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

// Read the catalog this generator produced last time. It is the authority on
// which download packages this generator owns, so pruning stale packages never
// touches directories owned by other marketplace sources.
const catalogPath = resolve(root, "config/vendored-skills.generated.json");
const previousSlugs = new Set();
if (await pathExists(catalogPath)) {
  try {
    const previous = JSON.parse(await readFile(catalogPath, "utf8"));
    for (const entry of previous.resources ?? []) previousSlugs.add(entry.slug);
  } catch {
    warnings.push("previous vendored catalog was unreadable; skipped stale package pruning");
  }
}

const resources = [];
const usedSlugs = new Map();
const duplicates = [];
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
    const slug = normalizeOpenSlug(`${source.id}-${name}`);
    const identity = skillIdentity(source.repo, name);
    const rawLicense = (fm.license || "").trim();
    const license =
      rawLicense && /^(MIT|Apache|BSD|ISC|GPL|MPL|CC|Unlicense)/i.test(rawLicense)
        ? rawLicense
        : source.license;
    const category = source.group_categories?.[group] || source.category;
    const description = (fm.description || `${source.name} skill: ${name}.`).slice(0, 500);
    const contentHash = sha256Hex(text);
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
      version: resolveVersion(fm.version, contentHash),
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
        content_hash: contentHash,
        upstream_commit: source.commit || null,
        upstream_ref: source.ref,
      },
      supported_clients: CLIENT_TARGETS,
      verified: false,
      featured: false,
      published: true,
      source_id: source.id,
      trust: source.trust,
      identity,
      group: group || null,
      rel_path: relPath,
    });
  }
}

const rank = (entry) => TRUST_RANK[entry.trust] ?? 9;

function aliasOf(loser) {
  return {
    source_id: loser.source_id,
    repository_url: loser.repository_url,
    slug: loser.slug,
    vendored_path: loser.installation_config.vendored_path,
    rel_path: loser.rel_path,
    content_hash: loser.installation_config.content_hash,
  };
}

// A dropped entry that shared a slug with the winner can only be identified by
// its vendored path.
function droppedId(winner, loser) {
  return loser.slug === winner.slug ? loser.rel_path : loser.slug;
}

function recordSuperseded(winner, loser, reason) {
  const lineage = new Set([...(winner.installation_config.superseded ?? [])]);
  lineage.add({
    id: droppedId(winner, loser),
    slug: loser.slug,
    rel_path: loser.rel_path,
    content_hash: loser.installation_config.content_hash,
    reason,
  });
  winner.installation_config.superseded = [...lineage].sort((a, b) => a.id.localeCompare(b.id));
  duplicates.push({
    canonical_slug: winner.slug,
    duplicate_slug: droppedId(winner, loser),
    content_hash: loser.installation_config.content_hash,
    canonical_content_hash: winner.installation_config.content_hash,
    reason,
    kept_source_id: winner.source_id,
    dropped_source_id: loser.source_id,
  });
}

// Pass 1: the same content vendored from several repositories is one entry. The
// highest-trust source is canonical and the others are kept as aliases so no
// upstream provenance is lost.
const canonicalByHash = new Map();
const afterHash = [];
for (const resource of resources) {
  const hash = resource.installation_config.content_hash;
  const existing = canonicalByHash.get(hash);
  if (!existing) {
    canonicalByHash.set(hash, resource);
    afterHash.push(resource);
    continue;
  }
  const winner = rank(resource) < rank(existing) ? resource : existing;
  const loser = winner === resource ? existing : resource;
  if (winner !== existing) {
    afterHash[afterHash.indexOf(existing)] = resource;
    canonicalByHash.set(hash, resource);
  }
  const aliases = new Set([...(winner.installation_config.aliases ?? [])]);
  aliases.add(aliasOf(loser));
  winner.installation_config.aliases = [...aliases].sort((a, b) =>
    a.source_id.localeCompare(b.source_id),
  );
  duplicates.push({
    canonical_slug: winner.slug,
    duplicate_slug: loser.slug,
    content_hash: hash,
    canonical_content_hash: hash,
    reason: "identical_content",
    kept_source_id: winner.source_id,
    dropped_source_id: loser.source_id,
  });
}

// Pass 2: the same skill name within one upstream repository can appear in more
// than one directory. That is a superseded revision, not a distinct resource.
// The longest body is the newest revision; shorter ones are recorded as
// lineage so the version history stays auditable.
const byIdentity = new Map();
for (const resource of afterHash) {
  const group = byIdentity.get(resource.identity) ?? [];
  group.push(resource);
  byIdentity.set(resource.identity, group);
}

const deduped = [];
for (const group of byIdentity.values()) {
  if (group.length === 1) {
    deduped.push(group[0]);
    continue;
  }
  const ordered = [...group].sort((a, b) => {
    const byLength = b.description.length - a.description.length;
    if (byLength !== 0) return byLength;
    return a.slug.localeCompare(b.slug);
  });
  const [winner, ...superseded] = ordered;
  for (const loser of superseded) {
    recordSuperseded(winner, loser, "superseded_revision");
  }
  deduped.push(winner);
}

resources.length = 0;
resources.push(...deduped);

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
  duplicate_count: duplicates.length,
  duplicates,
  resources,
};

await writeFile(
  resolve(root, "config/vendored-skills.generated.json"),
  `${JSON.stringify(catalog, null, 2)}\n`,
);

// Static download packages: one canonical SKILL.md per slug. Packages this
// generator published previously but no longer produces (renamed, deduped, or
// removed upstream) are pruned. The previous catalog is the authority on which
// directories this generator owns, so packages belonging to other marketplace
// sources are never touched.
const downloadsRoot = resolve(root, "public/downloads/skills");
const currentSlugs = new Set(resources.map((resource) => resource.slug));
let prunedPackages = 0;
for (const slug of previousSlugs) {
  if (currentSlugs.has(slug)) continue;
  const stale = resolve(downloadsRoot, slug);
  if (!(await pathExists(stale))) continue;
  await rm(stale, { recursive: true, force: true });
  prunedPackages += 1;
}
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

-- Prune vendored rows whose slugs no longer exist in the catalog (deduped or
-- removed upstream). Scoped strictly to the vendored-upstream source.
delete from public.resources
where source = 'vendored-upstream'
  and slug <> all (array[
${resources.map((r) => `    ${sqlLiteral(r.slug)}`).join(",\n")}
  ]);
`;

await writeFile(
  resolve(root, "supabase/migrations/20261006000000_vendored_upstream_skills.sql"),
  migration,
);

console.log(
  JSON.stringify(
    {
      resources: resources.length,
      categories: categorySlugs.length,
      duplicates: duplicates.length,
      prunedPackages,
      warnings,
    },
    null,
    2,
  ),
);
