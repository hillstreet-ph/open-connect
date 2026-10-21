#!/usr/bin/env node
// Publishes the public Claude plugin marketplaces and the owner's Claude
// account skills to the Open-Connect marketplace as metadata-only rows.
//
// Plugins come from each marketplace's .claude-plugin/marketplace.json
// (config/claude-marketplaces.registry.json lists the sources) and become
// published, unverified `plugin` rows with an install command. Account skills
// come from the committed catalog (config/claude-library) and become published,
// unverified `skill` rows owned by the library owner.
//
// Nothing is installed, executed, or vendored. Rows that already exist under
// another source are never touched, quarantined records are never written, and
// an admin's review decision (verified, featured, published, review_state) is
// preserved on every later sync.
//
// Discovery never publishes directly (AGENTS.md). Upstream is read only to
// regenerate the committed catalog in config/claude-marketplace, which lands
// through a reviewed pull request; --publish reads that committed catalog only.
//
// Usage:
//   node scripts/sync-claude-marketplaces.mjs            # report drift vs. upstream
//   node scripts/sync-claude-marketplaces.mjs --write    # regenerate the committed catalog
//   node scripts/sync-claude-marketplaces.mjs --check    # validate the committed catalog
//   node scripts/sync-claude-marketplaces.mjs --publish  # publish the committed catalog
// --marketplace-dir <dir> reads marketplace.json files from disk instead of
// GitHub. --publish requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  INDEX_FILE,
  REQUIRED_POLICY,
  hasSecret,
  loadLibrary,
  normalizeSlug,
  readCatalog,
  serializeCatalog,
  validateCatalog,
} from "./sync-claude-library.mjs";

const root = resolve(import.meta.dirname, "..");
export const CATALOG_DIR = resolve(root, "config/claude-marketplace");
const SHARD_PATTERN = /^resources-\d+\.generated\.json$/;
// Columns written to public.resources; every row is normalized to this set.
const COLUMNS = [
  "slug",
  "name",
  "description",
  "resource_type",
  "category_slug",
  "author",
  "source",
  "source_url",
  "repository_url",
  "version",
  "license",
  "installation_type",
  "installation_config",
  "supported_clients",
  "owner_id",
  "published",
  "verified",
  "featured",
];
export const PUBLIC_SOURCE = "claude-marketplace";
export const PRIVATE_SOURCE = "claude-account";
export const OWNER_RESOURCE_SLUG = "claude-skills-plugins-catalog";
const MAX_DESCRIPTION = 280;
const CLIENTS = ["Claude Code", "Cowork"];

const CATEGORY_MAP = {
  development: "developer",
  testing: "developer",
  productivity: "productivity",
  automation: "productivity",
  "project-management": "productivity",
  design: "productivity",
  database: "data",
  data: "data",
  location: "data",
  monitoring: "infrastructure",
  observability: "infrastructure",
  deployment: "infrastructure",
  migration: "infrastructure",
  security: "security",
  finance: "business",
  crm: "business",
  "life-sciences": "knowledge",
  healthcare: "knowledge",
  learning: "knowledge",
  math: "knowledge",
};

function clip(text) {
  const clean = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length > MAX_DESCRIPTION ? `${clean.slice(0, MAX_DESCRIPTION - 1)}…` : clean;
}

function stripGit(url) {
  return String(url).replace(/\.git$/, "");
}

// Upstream location of a plugin: a relative path inside the marketplace
// repository, a git URL, or a git URL with a subdirectory.
export function pluginUrls(plugin, marketplace) {
  const repo = `https://github.com/${marketplace.repository}`;
  const source = plugin.source;
  let upstream = repo;
  let repository = repo;
  if (typeof source === "string") {
    const path = source.replace(/^\.\//, "").replace(/\/$/, "");
    upstream = path ? `${repo}/tree/HEAD/${path}` : repo;
  } else if (source && typeof source === "object") {
    const base = source.url
      ? stripGit(source.url)
      : source.repo
        ? `https://github.com/${source.repo}`
        : repo;
    repository = base;
    upstream =
      source.path && /^https:\/\/github\.com\//.test(base)
        ? `${base}/tree/${source.ref || "HEAD"}/${String(source.path).replace(/^\.\//, "")}`
        : base;
  }
  const homepage = typeof plugin.homepage === "string" ? plugin.homepage : null;
  return { source_url: homepage || upstream, repository_url: repository, upstream_url: upstream };
}

// Index of existing library rows owned by other sources, keyed by slug, name
// and a hyphen-insensitive alias, so an existing resource is never duplicated.
export function foreignIndex(existing) {
  const index = new Map();
  for (const row of existing) {
    if (row.source === PUBLIC_SOURCE || row.source === PRIVATE_SOURCE) continue;
    for (const key of [row.slug, row.name]) {
      const slug = normalizeSlug(key ?? "");
      if (!slug) continue;
      for (const alias of [slug, `~${slug.replace(/-/g, "")}`]) {
        if (!index.has(alias)) index.set(alias, row.slug);
      }
    }
  }
  return index;
}

function matchForeign(index, ...names) {
  for (const name of names) {
    const slug = normalizeSlug(name ?? "");
    if (!slug) continue;
    for (const alias of [slug, `open-${slug}`, `~${slug.replace(/-/g, "")}`]) {
      if (index.has(alias)) return index.get(alias);
    }
  }
  return null;
}

export function buildPublicRows(registry, marketplaces) {
  const rows = [];
  const taken = new Map();
  const skipped = [];
  for (const marketplace of registry.marketplaces) {
    const manifest = marketplaces[marketplace.name];
    if (!manifest || manifest.name !== marketplace.name || !Array.isArray(manifest.plugins)) {
      throw new Error(`marketplace manifest missing or mismatched: ${marketplace.name}`);
    }
    for (const plugin of manifest.plugins) {
      const name = String(plugin.name || "").trim();
      const body = normalizeSlug(name);
      if (!body) {
        skipped.push({ marketplace: marketplace.name, name, reason: "invalid_name" });
        continue;
      }
      if (hasSecret(JSON.stringify(plugin))) {
        skipped.push({ marketplace: marketplace.name, name, reason: "secret_like_metadata" });
        continue;
      }
      const slug = `claude-plugin-${body}`.slice(0, 80).replace(/-+$/, "");
      const listed = taken.get(slug);
      if (listed) {
        // The same plugin offered by several marketplaces is one listing.
        listed.installation_config.also_listed_in.push({
          marketplace: marketplace.name,
          install_command: `/plugin install ${name}@${marketplace.name}`,
        });
        continue;
      }
      const urls = pluginUrls(plugin, marketplace);
      const row = {
        slug,
        name: plugin.displayName || name,
        description: clip(plugin.description),
        resource_type: "plugin",
        category_slug: CATEGORY_MAP[plugin.category] ?? marketplace.default_category,
        author: plugin.author?.name ?? null,
        source: PUBLIC_SOURCE,
        source_url: urls.source_url,
        repository_url: urls.repository_url,
        version: plugin.version ?? null,
        license: plugin.license ?? marketplace.license ?? null,
        installation_type: "claude-plugin",
        installation_config: {
          marketplace: marketplace.name,
          marketplace_repository: `https://github.com/${marketplace.repository}`,
          plugin: name,
          upstream_url: urls.upstream_url,
          install_command: `/plugin install ${name}@${marketplace.name}`,
          also_listed_in: [],
          review_state: "pending_security_review",
          executable: false,
          vendored_content: false,
          ingestion_mode: "metadata_only",
        },
        supported_clients: CLIENTS,
        owner_id: null,
        published: true,
        verified: false,
        featured: false,
        review_state: "pending_security_review",
      };
      taken.set(slug, row);
      rows.push(row);
    }
  }
  return { rows, skipped };
}

export function buildPrivateRows(catalog, ownerId) {
  const rows = [];
  for (const record of catalog.resources ?? []) {
    if (record.kind !== "account_skill") continue;
    if (record.review_state !== "pending_security_review" || record.duplicate_of) continue;
    rows.push({
      slug: record.slug,
      name: record.name,
      description: record.description ?? "",
      resource_type: "skill",
      category_slug: "developer",
      author: null,
      source: PRIVATE_SOURCE,
      source_url: null,
      repository_url: null,
      version: null,
      license: record.license ?? null,
      installation_type: "claude-skill",
      installation_config: {
        visibility: "public",
        review_state: "pending_security_review",
        executable: false,
        vendored_content: false,
        ingestion_mode: "metadata_only",
        sha256: record.sha256 ?? null,
        files: record.files ?? null,
      },
      supported_clients: CLIENTS,
      owner_id: ownerId,
      published: true,
      verified: false,
      featured: false,
      review_state: "pending_security_review",
    });
  }
  return rows;
}

// Splits desired rows into inserts, metadata-only updates of rows this sync
// already owns, conflicts with other sources, and stale rows to unpublish.
export function planSync(desired, existing) {
  const foreign = foreignIndex(existing);
  const ours = new Map(
    existing
      .filter((row) => row.source === PUBLIC_SOURCE || row.source === PRIVATE_SOURCE)
      .map((row) => [row.slug, row]),
  );
  const bySlug = new Map(existing.map((row) => [row.slug, row]));
  const plan = { insert: [], update: [], already_in_library: [], unpublish: [] };
  const wanted = new Set();
  for (const row of desired) {
    const current = bySlug.get(row.slug);
    if (current && !ours.has(row.slug)) {
      plan.already_in_library.push({ slug: row.slug, existing: current.slug });
      continue;
    }
    const match = ours.has(row.slug)
      ? null
      : matchForeign(foreign, row.installation_config.plugin ?? row.name, row.name);
    if (match) {
      plan.already_in_library.push({ slug: row.slug, existing: match });
      continue;
    }
    wanted.add(row.slug);
    if (!current) {
      plan.insert.push(row);
      continue;
    }
    const { published, verified, featured, owner_id, ...metadata } = row;
    const review = current.installation_config?.review_state;
    if (review && review !== "pending_security_review") {
      metadata.installation_config = { ...metadata.installation_config, review_state: review };
    }
    plan.update.push(metadata);
  }
  for (const row of ours.values()) {
    if (!wanted.has(row.slug) && row.published && !row.verified) plan.unpublish.push(row.slug);
  }
  return plan;
}

async function loadMarketplaces(registry, dir) {
  const result = {};
  for (const marketplace of registry.marketplaces) {
    if (dir) {
      const file = join(dir, `${marketplace.repository.split("/")[1]}.json`);
      result[marketplace.name] = JSON.parse(await readFile(file, "utf8"));
      continue;
    }
    const url = `https://raw.githubusercontent.com/${marketplace.repository}/HEAD/.claude-plugin/marketplace.json`;
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`fetch failed ${response.status}: ${url}`);
    result[marketplace.name] = await response.json();
  }
  return result;
}

function supabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key)
    throw new Error("--publish requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  return async (path, init = {}) => {
    const response = await fetch(`${url}/rest/v1/${path}`, {
      ...init,
      headers: { ...headers, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      throw new Error(
        `supabase ${init.method ?? "GET"} ${path.split("?")[0]} HTTP ${response.status}: ${detail}`,
      );
    }
    return response.status === 204 || init.method ? null : response.json();
  };
}

// Pages through every resource row; PostgREST caps a single response.
async function fetchAll(db) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await db(
      `resources?select=slug,name,source,published,verified,installation_config,owner_id&order=slug&limit=1000&offset=${offset}`,
    );
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

function chunks(items, size = 100) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// Every committed row, normalized to the full column set so PostgREST batches
// share one key set (the committed shards drop null and empty fields).
export function normalizeRow(row) {
  return Object.fromEntries(COLUMNS.map((column) => [column, row[column] ?? null]));
}

// Builds the catalog to commit: public plugins plus account skills, minus any
// resource the library snapshot already holds under another slug or name.
export function buildCatalog(registry, marketplaces, libraryCatalog, libraryIndex) {
  const { rows: publicRows, skipped } = buildPublicRows(registry, marketplaces);
  const privateRows = buildPrivateRows(libraryCatalog, null);
  const resources = [];
  const alreadyInLibrary = [];
  for (const row of [...publicRows, ...privateRows]) {
    const match = libraryIndex
      ? matchForeign(libraryIndex, row.installation_config.plugin ?? row.name, row.name)
      : null;
    if (match && match !== row.slug) alreadyInLibrary.push({ slug: row.slug, existing: match });
    else resources.push(row);
  }
  resources.sort((a, b) => a.slug.localeCompare(b.slug));
  const upstream = registry.marketplaces.reduce(
    (sum, marketplace) => sum + marketplaces[marketplace.name].plugins.length,
    0,
  );
  return {
    catalog: {
      schema_version: "1.0.0",
      registry_id: "open-connect-claude-marketplace",
      policy: { ...REQUIRED_POLICY },
      source: "claude-marketplaces+claude-account",
      counts: {
        total: resources.length,
        plugins: resources.filter((row) => row.resource_type === "plugin").length,
        account_skills: resources.filter((row) => row.resource_type === "skill").length,
        upstream_listings: upstream,
        already_in_library: alreadyInLibrary.length,
        skipped: skipped.length,
      },
      resources,
    },
    alreadyInLibrary,
    skipped,
  };
}

async function writeMarketplaceCatalog(dir, catalog) {
  await mkdir(dir, { recursive: true });
  for (const name of await readdir(dir)) {
    if (name === INDEX_FILE || SHARD_PATTERN.test(name)) await rm(join(dir, name));
  }
  const files = serializeCatalog(catalog);
  for (const [name, text] of Object.entries(files)) await writeFile(join(dir, name), text);
}

async function committedFiles(dir) {
  const files = {};
  try {
    for (const name of await readdir(dir)) {
      if (name === INDEX_FILE || SHARD_PATTERN.test(name))
        files[name] = await readFile(join(dir, name), "utf8");
    }
  } catch {
    return {};
  }
  return files;
}

async function main() {
  const argv = process.argv.slice(2);
  const flag = (name) => {
    const at = argv.indexOf(name);
    return at === -1 ? null : argv[at + 1];
  };
  const dir = flag("--catalog-dir") ? resolve(flag("--catalog-dir")) : CATALOG_DIR;

  if (argv.includes("--check") || argv.includes("--publish")) {
    const catalog = await readCatalog(dir);
    if (!catalog) throw new Error(`committed catalog missing: ${dir}`);
    const errors = validateCatalog(catalog);
    if (errors.length) throw new Error(errors.join("\n"));
    if (!argv.includes("--publish")) {
      console.log(JSON.stringify({ mode: "check", valid: true, ...catalog.counts }));
      return;
    }
    const db = supabaseClient();
    const existing = await fetchAll(db);
    const ownerId = existing.find((row) => row.slug === OWNER_RESOURCE_SLUG)?.owner_id ?? null;
    const rows = catalog.resources
      .filter((row) => row.resource_type !== "skill" || ownerId)
      .map((row) =>
        normalizeRow(row.resource_type === "skill" ? { ...row, owner_id: ownerId } : row),
      );
    const plan = planSync(rows, existing);
    for (const batch of chunks(plan.insert)) {
      await db("resources", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(batch),
      });
    }
    for (const batch of chunks(plan.update)) {
      await db("resources?on_conflict=slug", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(batch),
      });
    }
    for (const batch of chunks(plan.unpublish)) {
      const list = batch.map((slug) => `"${slug}"`).join(",");
      await db(
        `resources?slug=in.(${encodeURIComponent(list)})&source=in.(${PUBLIC_SOURCE},${PRIVATE_SOURCE})`,
        {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ published: false }),
        },
      );
    }
    console.log(
      JSON.stringify({
        mode: "publish",
        rows: rows.length,
        account_skills_skipped_no_owner: !ownerId,
        insert: plan.insert.length,
        update: plan.update.length,
        already_in_library: plan.already_in_library.length,
        unpublish_stale: plan.unpublish.length,
      }),
    );
    return;
  }

  const registry = JSON.parse(
    await readFile(resolve(root, "config/claude-marketplaces.registry.json"), "utf8"),
  );
  const marketplaces = await loadMarketplaces(registry, flag("--marketplace-dir"));
  const libraryCatalog = await readCatalog(resolve(root, "config/claude-library"));
  if (!libraryCatalog) throw new Error("config/claude-library catalog missing");
  const libraryIndex = await loadLibrary(
    resolve(root, "config/open-connect-library.snapshot.json"),
  );
  const { catalog } = buildCatalog(registry, marketplaces, libraryCatalog, libraryIndex);
  const errors = validateCatalog(catalog);
  if (errors.length) throw new Error(errors.join("\n"));

  if (argv.includes("--write")) {
    await writeMarketplaceCatalog(dir, catalog);
    console.log(JSON.stringify({ mode: "write", ...catalog.counts }));
    return;
  }
  const expected = serializeCatalog(catalog);
  const current = await committedFiles(dir);
  const names = new Set([...Object.keys(expected), ...Object.keys(current)]);
  const drifted = [...names].filter((name) => expected[name] !== current[name]).length;
  console.log(JSON.stringify({ mode: "drift", drifted, ...catalog.counts }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
