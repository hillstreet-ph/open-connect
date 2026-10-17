#!/usr/bin/env node
// Builds the metadata-only Claude skills and plugins catalog for the
// Open-Connect library from a Claude client's local skill and plugin roots.
//
// Nothing here installs, executes, uploads, or vendors third-party code.
// Each record carries provenance, a declared license, a content hash, and a
// duplicate pointer to an existing Open-Connect library resource when one exists.
//
// Usage:
//   node scripts/sync-claude-library.mjs [--skills <dir>]... [--plugins <dir>]...
//        [--library config/open-connect-library.snapshot.json]
//        [--out config/claude-library.catalog.json] [--check]
//
// Defaults: every directory under ~/.claude/skills/synced and
// ~/.claude/plugins/synced (the Claude/Cowork synced account roots).
// --check validates an existing catalog without scanning or writing.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const SCHEMA_VERSION = "1.0.0";
const MAX_DESCRIPTION = 280;
const SKIP_DIRS = new Set(["node_modules", ".git", "__pycache__", ".venv", "dist", "build"]);

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
  args.out ??= resolve(root, "config/claude-library.catalog.json");
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
  return childDirs(join(homedir(), ".claude", kind, "synced"));
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

function clip(text) {
  const clean = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length > MAX_DESCRIPTION ? `${clean.slice(0, MAX_DESCRIPTION - 1)}…` : clean;
}

export function hasSecret(text) {
  return SECRET_PATTERNS.some((pattern) => pattern.test(text));
}

function sha(text) {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
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

async function countFiles(dir) {
  let count = 0;
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) await visit(join(current, entry.name));
      } else count += 1;
    }
  }
  await visit(dir);
  return count;
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

async function loadLibrary(path) {
  const slugs = new Map();
  const snapshot = await readJson(path);
  for (const item of snapshot?.resources ?? []) slugs.set(item.slug, item.slug);
  const vendored = await readJson(resolve(root, "config/vendored-skills.generated.json"));
  for (const item of vendored?.resources ?? []) slugs.set(item.slug, item.slug);
  // Index by bare name too, so "github-e2e-setup" matches "open-github-e2e-setup" or "-xxxx" suffixes.
  const byStem = new Map();
  for (const slug of slugs.keys()) {
    const stem = slug.replace(/^open-/, "").replace(/-[a-z0-9]{4}$/, "");
    if (!byStem.has(stem)) byStem.set(stem, slug);
    if (!byStem.has(slug)) byStem.set(slug, slug);
  }
  return byStem;
}

function duplicateOf(library, ...candidates) {
  for (const candidate of candidates) {
    const slug = normalizeSlug(candidate);
    if (library.has(slug)) return library.get(slug);
    if (library.has(slug.replace(/^open-/, ""))) return library.get(slug.replace(/^open-/, ""));
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
      const description = clip(fm.description);
      const quarantined = hasSecret(text);
      records.push({
        slug: `claude-skill-${normalizeSlug(name)}`,
        name,
        kind: "account_skill",
        description: quarantined ? "" : description,
        license: await detectLicense(dir, fm.license),
        sha256: sha(text),
        files: await countFiles(dir),
        duplicate_of: duplicateOf(library, name),
        review_state: quarantined ? "quarantined_metadata" : "pending_security_review",
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
      const skillDirs = await findSkillDirs(join(dir, "skills"));
      const skills = [];
      let quarantined = false;
      for (const skillDir of skillDirs) {
        const text = await readFile(join(skillDir, "SKILL.md"), "utf8");
        if (hasSecret(text)) quarantined = true;
        skills.push(parseFrontmatter(text).name || basename(skillDir));
      }
      const listCount = async (sub) =>
        existsSync(join(dir, sub)) ? (await readdir(join(dir, sub))).length : 0;
      const repository =
        typeof manifest.repository === "string" ? manifest.repository : manifest.repository?.url;
      records.push({
        slug: `claude-plugin-${normalizeSlug(id)}`,
        id,
        name: manifest.name || id,
        kind: "plugin",
        version: manifest.version ?? null,
        author: manifest.author?.name ?? null,
        description: clip(manifest.description),
        marketplace: meta.marketplace_name ?? null,
        server_plugin_id: meta.server_plugin_id ?? null,
        installation: meta.installation_preference ?? null,
        homepage: manifest.homepage ?? null,
        repository: repository ?? null,
        license: await detectLicense(dir, manifest.license),
        has_mcp: existsSync(join(dir, ".mcp.json")),
        commands: await listCount("commands"),
        agents: await listCount("agents"),
        skills: [...new Set(skills)].sort(),
        duplicate_of: duplicateOf(library, id, manifest.name || id, `open-${id}-kit`),
        review_state: quarantined ? "quarantined_metadata" : "pending_security_review",
      });
    }
  }
  return records;
}

export function validateCatalog(catalog) {
  const errors = [];
  if (catalog?.schema_version !== SCHEMA_VERSION) errors.push("schema_version mismatch");
  if (catalog?.policy?.executable !== false || catalog?.policy?.vendored_content !== false)
    errors.push("policy must be metadata-only and non-executable");
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

// One resource per line keeps diffs reviewable while staying under the
// 256 KiB Open-Connect library upload limit.
export function serializeCatalog(catalog) {
  const { resources, ...head } = catalog;
  const lines = resources.map((record) => `  ${JSON.stringify(compact(record))}`);
  const header = JSON.stringify(head).slice(0, -1);
  return `${header},"resources":[\n${lines.join(",\n")}\n]}\n`;
}

function dedupeSlugs(records) {
  const used = new Map();
  for (const record of records) {
    const count = (used.get(record.slug) ?? 0) + 1;
    used.set(record.slug, count);
    if (count > 1) record.slug = `${record.slug}-${count}`.slice(0, 80);
  }
  return records;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.check) {
    const errors = validateCatalog(await readJson(args.out));
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
  const resources = dedupeSlugs([...skills, ...plugins]).sort((a, b) =>
    a.slug.localeCompare(b.slug),
  );
  const catalog = {
    schema_version: SCHEMA_VERSION,
    registry_id: "open-connect-claude-library",
    policy: {
      mode: "metadata_only",
      executable: false,
      vendored_content: false,
      auto_install: false,
      auto_publish: false,
      require_security_review: true,
    },
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
  await writeFile(args.out, serializeCatalog(catalog));
  console.log(
    JSON.stringify({ out: relative(root, args.out).split(sep).join("/"), ...catalog.counts }),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
