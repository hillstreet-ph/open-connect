#!/usr/bin/env node
// Builds the metadata-only Claude skills and plugins catalog for the
// Open-Connect library from a Claude client's local skill and plugin roots.
//
// Nothing here installs, executes, uploads, or vendors third-party code.
// Each record carries provenance, a declared license, a content fingerprint,
// and a duplicate pointer to an existing Open-Connect library resource.
//
// Usage:
//   node scripts/sync-claude-library.mjs [--skills <dir>]... [--plugins <dir>]...
//        [--library config/open-connect-library.snapshot.json]
//        [--out config/claude-library] [--check]
//
// Defaults: every directory under ~/.claude/skills/synced and
// ~/.claude/plugins/synced (the Claude/Cowork synced account roots). A missing
// default root aborts the run so a partial scan never overwrites the catalog.
// --check validates an existing catalog without scanning or writing.
//
// Output: <out>/index.generated.json (policy, counts, shard list) plus
// resources-NN.generated.json shards of at most SHARD_BYTES UTF-8 bytes each,
// one resource per line, so every file stays reviewable and small enough for
// connector-based commits.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const SCHEMA_VERSION = "1.0.0";
const MAX_DESCRIPTION = 280;
const MAX_SCAN_BYTES = 1024 * 1024;
export const SHARD_BYTES = 40 * 1024;
export const INDEX_FILE = "index.generated.json";
const SHARD_PATTERN = /^resources-\d+\.generated\.json$/;
const SKIP_DIRS = new Set(["node_modules", ".git", "__pycache__", ".venv", "dist", "build"]);
const BINARY_EXT =
  /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tgz|woff2?|ttf|otf|mp[34]|mov|wasm|so|dylib|pyc|db|sqlite)$/i;

export const REQUIRED_POLICY = Object.freeze({
  mode: "metadata_only",
  executable: false,
  vendored_content: false,
  auto_install: false,
  auto_publish: false,
  require_security_review: true,
});

export const SECRET_PATTERNS = [
  /AKIA[0-9A-Z]{16}/,
  /\bgh[pousr]_[A-Za-z0-9]{36,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{40,}\b/,
  /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{32,}\b/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/,
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
  /\beyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/,
  /\bdckr_pat_[A-Za-z0-9_-]{20,}\b/,
  /\bsbp_[a-f0-9]{40}\b/,
];

const LICENSE_RULES = [
  [/apache license/i, "Apache-2.0"],
  [/\bMIT License\b|Permission is hereby granted, free of charge/i, "MIT"],
  [/\bISC License\b/i, "ISC"],
  [/BSD 3-Clause|Redistribution and use in source and binary forms/i, "BSD"],
  [/Mozilla Public License/i, "MPL-2.0"],
  [/GNU (?:AFFERO )?GENERAL PUBLIC LICENSE/i, "GPL"],
  [/All rights reserved|proprietary/i, "Proprietary"],
];

function parseArgs(argv) {
  const args = { skills: [], plugins: [], library: null, out: null, check: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--check") args.check = true;
    else if (["--skills", "--plugins", "--library", "--out"].includes(flag)) {
      const value = argv[(i += 1)];
      if (!value) throw new Error(`${flag} requires a value`);
      if (flag === "--skills") args.skills.push(resolve(value));
      else if (flag === "--plugins") args.plugins.push(resolve(value));
      else args[flag.slice(2)] = resolve(value);
    } else throw new Error(`unknown argument: ${flag}`);
  }
  args.out ??= resolve(root, "config/claude-library");
  args.library ??= resolve(root, "config/open-connect-library.snapshot.json");
  return args;
}

async function childDirs(dir) {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => join(dir, entry.name));
}

async function defaultRoots(kind) {
  const base = join(homedir(), ".claude", kind, "synced");
  if (!existsSync(base)) throw new Error(`default ${kind} root not found: ${base}`);
  const roots = await childDirs(base);
  if (!roots.length) throw new Error(`default ${kind} root is empty: ${base}`);
  return roots;
}

export function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) return {};
  const fields = {};
  const lines = match[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(lines[i]);
    if (!kv) continue;
    const key = kv[1].toLowerCase();
    let value = kv[2].trim();
    if (value === ">" || value === "|" || value === ">-" || value === "|-") {
      const block = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1]))
        block.push(lines[(i += 1)].trim());
      value = block.join(" ");
    }
    if (
      value.length > 1 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    if (value) fields[key] = value;
  }
  return fields;
}

export function normalizeSlug(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function sha(text) {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

// Slug body for a resource: its name, else its directory, else a stable hash,
// so a fully non-ASCII name can never yield an empty slug.
export function slugBody(...candidates) {
  for (const candidate of candidates) {
    const slug = normalizeSlug(candidate ?? "");
    if (slug) return slug;
  }
  return `x${sha(candidates.join("|")).slice(0, 12)}`;
}

function clip(text) {
  const clean = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length > MAX_DESCRIPTION ? `${clean.slice(0, MAX_DESCRIPTION - 1)}…` : clean;
}

export function hasSecret(text) {
  return SECRET_PATTERNS.some((pattern) => pattern.test(text));
}

async function detectLicense(dir, declared) {
  if (declared) return declared;
  const entries = existsSync(dir) ? await readdir(dir) : [];
  const file = entries.find((name) => /^licen[cs]e/i.test(name));
  if (!file) return null;
  const head = (await readFile(join(dir, file), "utf8")).slice(0, 2000);
  for (const [pattern, spdx] of LICENSE_RULES) if (pattern.test(head)) return spdx;
  return "LicenseRef-unknown";
}

async function findSkillDirs(base) {
  const found = [];
  async function visit(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (entries.some((entry) => entry.isFile() && entry.name === "SKILL.md")) {
      found.push(dir);
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) await visit(join(dir, entry.name));
    }
  }
  await visit(base);
  return found.sort();
}

async function listFiles(dir) {
  const files = [];
  async function visit(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) await visit(path);
      } else if (entry.isFile()) files.push(path);
    }
  }
  await visit(dir);
  return files;
}

// Scans every file under dir: fingerprints the whole tree (relative path +
// content) and flags secret-like text in any text file, not only SKILL.md.
export async function inspectTree(dir) {
  const hash = createHash("sha256");
  let secret = false;
  const files = await listFiles(dir);
  for (const file of files) {
    const bytes = await readFile(file);
    hash.update(relative(dir, file).split(sep).join("/"));
    hash.update("\0");
    hash.update(bytes);
    if (!secret && bytes.length <= MAX_SCAN_BYTES && !BINARY_EXT.test(file)) {
      secret = hasSecret(bytes.toString("utf8"));
    }
  }
  return { files: files.length, sha256: hash.digest("hex").slice(0, 16), secret };
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

// Library index keyed by normalized slug and declared name. An unreadable or
// malformed snapshot aborts the sync so duplicate pointers are never lost.
export async function loadLibrary(path) {
  const snapshot = await readJson(path);
  if (!Array.isArray(snapshot?.resources) || !snapshot.resources.length) {
    throw new Error(`library snapshot missing or invalid: ${path}`);
  }
  const vendored = await readJson(resolve(root, "config/vendored-skills.generated.json"));
  const index = new Map();
  const add = (key, slug) => {
    const normalized = normalizeSlug(key ?? "");
    if (!normalized) return;
    // Hyphen-insensitive alias so "Full-Stack X" matches "fullstack-x".
    for (const alias of [normalized, `~${normalized.replace(/-/g, "")}`]) {
      if (!index.has(alias)) index.set(alias, slug);
    }
  };
  for (const item of [...snapshot.resources, ...(vendored?.resources ?? [])]) {
    add(item.slug, item.slug);
    add(item.name, item.slug);
  }
  return index;
}

function duplicateOf(library, ...candidates) {
  for (const candidate of candidates) {
    const slug = normalizeSlug(candidate ?? "");
    if (!slug) continue;
    for (const alias of [slug, `open-${slug}`, `~${slug.replace(/-/g, "")}`]) {
      if (library.has(alias)) return library.get(alias);
    }
  }
  return null;
}

async function scanSkills(roots, library) {
  const records = [];
  for (const base of roots) {
    for (const dir of await findSkillDirs(base)) {
      const text = await readFile(join(dir, "SKILL.md"), "utf8");
      const fm = parseFrontmatter(text);
      const name = (fm.name || basename(dir)).trim();
      const tree = await inspectTree(dir);
      records.push({
        slug: `claude-skill-${slugBody(name, basename(dir), dir)}`,
        name,
        kind: "account_skill",
        description: tree.secret ? "" : clip(fm.description),
        license: await detectLicense(dir, fm.license),
        sha256: tree.sha256,
        files: tree.files,
        duplicate_of: duplicateOf(library, name, basename(dir)),
        review_state: tree.secret ? "quarantined_metadata" : "pending_security_review",
      });
    }
  }
  return records;
}

async function scanPlugins(roots, library) {
  const records = [];
  for (const base of roots) {
    for (const dir of await childDirs(base)) {
      const manifest = await readJson(join(dir, ".claude-plugin", "plugin.json"));
      if (!manifest) continue;
      const id = basename(dir);
      const meta = (await readJson(join(base, `${id}.meta.json`))) ?? {};
      const skills = [];
      for (const skillDir of await findSkillDirs(join(dir, "skills"))) {
        const text = await readFile(join(skillDir, "SKILL.md"), "utf8");
        skills.push(parseFrontmatter(text).name || basename(skillDir));
      }
      const tree = await inspectTree(dir);
      const listCount = async (sub) =>
        existsSync(join(dir, sub)) ? (await readdir(join(dir, sub))).length : 0;
      const repository =
        typeof manifest.repository === "string" ? manifest.repository : manifest.repository?.url;
      records.push({
        slug: `claude-plugin-${slugBody(id, manifest.name, dir)}`,
        id,
        name: manifest.name || id,
        kind: "plugin",
        version: manifest.version ?? null,
        author: manifest.author?.name ?? null,
        description: tree.secret ? "" : clip(manifest.description),
        marketplace: meta.marketplace_name ?? null,
        server_plugin_id: meta.server_plugin_id ?? null,
        installation: meta.installation_preference ?? null,
        homepage: manifest.homepage ?? null,
        repository: repository ?? null,
        license: await detectLicense(dir, manifest.license),
        sha256: tree.sha256,
        files: tree.files,
        has_mcp: existsSync(join(dir, ".mcp.json")),
        commands: await listCount("commands"),
        agents: await listCount("agents"),
        skills: [...new Set(skills)].sort(),
        duplicate_of: duplicateOf(library, id, manifest.name, `open-${id}-kit`),
        review_state: tree.secret ? "quarantined_metadata" : "pending_security_review",
      });
    }
  }
  return records;
}

export function validateCatalog(catalog) {
  const errors = [];
  if (catalog?.schema_version !== SCHEMA_VERSION) errors.push("schema_version mismatch");
  for (const [key, expected] of Object.entries(REQUIRED_POLICY)) {
    if (catalog?.policy?.[key] !== expected)
      errors.push(`policy.${key} must be ${JSON.stringify(expected)}`);
  }
  const seen = new Set();
  for (const record of catalog?.resources ?? []) {
    if (!/^claude-(skill|plugin)-[a-z0-9-]+$/.test(record.slug))
      errors.push(`bad slug ${record.slug}`);
    if (seen.has(record.slug)) errors.push(`duplicate slug ${record.slug}`);
    seen.add(record.slug);
    if (!["pending_security_review", "quarantined_metadata"].includes(record.review_state))
      errors.push(`invalid review_state for ${record.slug}`);
    if (hasSecret(JSON.stringify(record))) errors.push(`secret-like metadata in ${record.slug}`);
  }
  const counts = catalog?.counts ?? {};
  const actual = (catalog?.resources ?? []).length;
  if (counts.total !== actual) errors.push(`counts.total ${counts.total} != ${actual}`);
  return errors;
}

function compact(record) {
  return Object.fromEntries(
    Object.entries(record).filter(
      ([, value]) => value !== null && value !== "" && !(Array.isArray(value) && !value.length),
    ),
  );
}

const SHARD_OPEN = "[\n  ";
const SHARD_JOIN = ",\n  ";
const SHARD_CLOSE = "\n]\n";

// Splits the catalog into an index plus shards whose UTF-8 size, including
// the surrounding JSON, never exceeds SHARD_BYTES (a single oversized record
// gets a shard of its own). Returns { "<file>": text, ... }.
export function serializeCatalog(catalog) {
  const { resources, ...head } = catalog;
  const frame = Buffer.byteLength(SHARD_OPEN) + Buffer.byteLength(SHARD_CLOSE);
  const joint = Buffer.byteLength(SHARD_JOIN);
  const shards = [];
  let current = [];
  let size = frame;
  for (const record of resources) {
    const line = JSON.stringify(compact(record));
    const lineBytes = Buffer.byteLength(line);
    if (current.length && size + joint + lineBytes > SHARD_BYTES) {
      shards.push(current);
      current = [];
      size = frame;
    }
    size += lineBytes + (current.length ? joint : 0);
    current.push(line);
  }
  if (current.length) shards.push(current);
  const names = shards.map((_, i) => `resources-${String(i + 1).padStart(2, "0")}.generated.json`);
  const files = {};
  shards.forEach((lines, i) => {
    files[names[i]] = `${SHARD_OPEN}${lines.join(SHARD_JOIN)}${SHARD_CLOSE}`;
  });
  files[INDEX_FILE] = `${JSON.stringify({ ...head, shards: names }, null, 2)}\n`;
  return files;
}

export async function readCatalog(dir) {
  const index = await readJson(join(dir, INDEX_FILE));
  if (!index) return null;
  const resources = [];
  for (const name of index.shards ?? [])
    resources.push(...((await readJson(join(dir, name))) ?? []));
  const { shards, ...head } = index;
  return { ...head, shards, resources };
}

async function writeCatalog(dir, catalog) {
  await mkdir(dir, { recursive: true });
  for (const name of await readdir(dir)) {
    if (name === INDEX_FILE || SHARD_PATTERN.test(name)) await rm(join(dir, name));
  }
  const files = serializeCatalog(catalog);
  for (const [name, text] of Object.entries(files)) await writeFile(join(dir, name), text);
  return Object.keys(files).length;
}

// Assigns unique slugs against every slug already taken, truncating the base
// before appending a suffix so the suffix is never sliced away.
export function dedupeSlugs(records) {
  const taken = new Set();
  for (const record of records) {
    if (!taken.has(record.slug)) {
      taken.add(record.slug);
      continue;
    }
    for (let n = 2; ; n += 1) {
      const suffix = `-${n}`;
      const candidate = `${record.slug.slice(0, 80 - suffix.length).replace(/-+$/, "")}${suffix}`;
      if (!taken.has(candidate)) {
        record.slug = candidate;
        taken.add(candidate);
        break;
      }
    }
  }
  return records;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.check) {
    const errors = validateCatalog(await readCatalog(args.out));
    if (errors.length) {
      console.error(errors.join("\n"));
      process.exit(1);
    }
    console.log(`catalog valid: ${relative(root, args.out)}`);
    return;
  }
  const skillRoots = args.skills.length ? args.skills : await defaultRoots("skills");
  const pluginRoots = args.plugins.length ? args.plugins : await defaultRoots("plugins");
  for (const dir of [...skillRoots, ...pluginRoots]) {
    if (!(await stat(dir).catch(() => null))?.isDirectory())
      throw new Error(`not a directory: ${dir}`);
  }
  const library = await loadLibrary(args.library);
  const skills = await scanSkills(skillRoots, library);
  const plugins = await scanPlugins(pluginRoots, library);
  // Sort before and after dedupe so suffix assignment is deterministic.
  const resources = [...skills, ...plugins].sort((a, b) => a.slug.localeCompare(b.slug));
  dedupeSlugs(resources);
  resources.sort((a, b) => a.slug.localeCompare(b.slug));
  const catalog = {
    schema_version: SCHEMA_VERSION,
    registry_id: "open-connect-claude-library",
    policy: { ...REQUIRED_POLICY },
    source: "claude-synced-account",
    counts: {
      total: resources.length,
      account_skills: skills.length,
      plugins: plugins.length,
      plugin_skills: plugins.reduce((sum, plugin) => sum + plugin.skills.length, 0),
      already_in_library: resources.filter((r) => r.duplicate_of).length,
      quarantined: resources.filter((r) => r.review_state === "quarantined_metadata").length,
    },
    resources,
  };
  const errors = validateCatalog(catalog);
  if (errors.length) throw new Error(errors.join("\n"));
  const fileCount = await writeCatalog(args.out, catalog);
  console.log(
    JSON.stringify({
      out: relative(root, args.out).split(sep).join("/"),
      files: fileCount,
      ...catalog.counts,
    }),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
