#!/usr/bin/env node
// Resolves the current upstream commit for every vendored source and records it
// in the manifest. This is how "latest version" stays observable: the catalog
// pins the commit each vendored tree came from, and this reports when upstream
// has moved past that pin.
//
// A pin may only advance when the vendored content is unchanged. If a markdown
// file moved, the snapshot under skills/vendor no longer matches the new commit,
// and stamping the new commit would forge provenance. Those sources are reported
// as requiring a re-vendor instead.
//
// Usage:
//   node scripts/sync-vendored-upstreams.mjs           # report drift only
//   node scripts/sync-vendored-upstreams.mjs --write   # advance safe pins
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const manifestPath = resolve(root, "config/vendored-skills.manifest.json");
const write = process.argv.includes("--write");

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const token = process.env.GITHUB_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN;

const OWNER_REPO = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const REF = /^[A-Za-z0-9][A-Za-z0-9._\/-]*$/;

function githubSlug(source) {
  const slug = String(source.repo ?? "").replace(/^https:\/\/github\.com\//, "");
  if (!OWNER_REPO.test(slug)) {
    throw new Error(`refusing to request a non-repository source: ${source.repo}`);
  }
  return slug;
}

function headers() {
  const value = { Accept: "application/vnd.github+json" };
  if (token) value.Authorization = `Bearer ${token}`;
  return value;
}

const API_ORIGIN = "https://api.github.com";

async function github(path) {
  // Build the URL explicitly and pin the origin, so a manifest value can only
  // ever select a path on the GitHub API rather than redirect the request.
  const url = new URL(path.replace(/^\/+/, ""), `${API_ORIGIN}/`);
  if (url.origin !== API_ORIGIN) {
    throw new Error(`refusing to request outside ${API_ORIGIN}: ${url.href}`);
  }
  const response = await fetch(url, { headers: headers() });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${await response.text()}`);
  }
  return response.json();
}

async function latestCommit(repo, ref) {
  const body = await github(`repos/${repo}/commits/${ref}`);
  return { sha: body.sha, date: body.commit?.committer?.date ?? null };
}

// Only the vendored skill roots matter. A change elsewhere in the repository
// (docs, AGENTS.md, unrelated packages) does not make the snapshot stale, so
// comparing the whole repository would report drift that never needs acting on.
function vendoredRoots(source) {
  return source.vendored_paths ?? [source.upstream_index].filter(Boolean);
}

function inVendoredRoot(path, roots) {
  return roots.some((root) => {
    const prefix = root.replace(/\/+$/, "");
    return path === prefix || path.startsWith(`${prefix}/`);
  });
}

function changedMarkdown(files, roots) {
  return files
    .map((file) => file.filename)
    .filter((name) => /\.md$/i.test(name) && inVendoredRoot(name, roots));
}

async function contentChanged(repo, pinned, latest, roots) {
  const body = await github(`repos/${repo}/compare/${pinned}...${latest}?per_page=300`);
  const files = body.files ?? [];
  const changed = changedMarkdown(files, roots);
  // A truncated comparison cannot prove the snapshot is current.
  const truncated = files.length >= 300;
  return { changed, truncated };
}

const drift = [];
const requiresRevendor = [];
const failures = [];

for (const source of manifest.sources) {
  const slug = githubSlug(source);
  try {
    const ref = source.ref ?? "main";
    if (!REF.test(ref)) throw new Error(`refusing to request an unsafe ref: ${ref}`);
    const latest = await latestCommit(slug, ref);
    const pinned = source.commit ?? null;
    if (pinned === latest.sha) continue;

    const entry = {
      id: source.id,
      repo: source.repo,
      ref: source.ref ?? "main",
      pinned,
      latest: latest.sha,
      latest_date: latest.date,
    };

    if (pinned) {
      const { changed, truncated } = await contentChanged(
        slug,
        pinned,
        latest.sha,
        vendoredRoots(source),
      );
      if (changed.length > 0 || truncated) {
        requiresRevendor.push({
          ...entry,
          reason: truncated ? "comparison_truncated" : "vendored_markdown_changed",
          changed_files: changed.slice(0, 10),
          changed_count: changed.length,
        });
        drift.push(entry);
        continue;
      }
    }

    drift.push(entry);
    if (write) {
      source.commit = latest.sha;
      source.commit_date = latest.date;
    }
  } catch (error) {
    failures.push({ id: source.id, error: String(error.message ?? error) });
  }
}

if (write && drift.length > 0) {
  manifest.resolved_at = new Date().toISOString();
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

console.log(
  JSON.stringify(
    {
      checked: manifest.sources.length,
      drifted: drift.length,
      advanced: write ? drift.length - requiresRevendor.length : 0,
      requires_revendor: requiresRevendor,
      drift,
      failures,
    },
    null,
    2,
  ),
);

if (failures.length > 0 || requiresRevendor.length > 0) process.exitCode = 1;
