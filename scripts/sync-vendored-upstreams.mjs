#!/usr/bin/env node
// Resolves the current upstream commit for every vendored source and records it
// in the manifest. This is how "latest version" stays observable: the catalog
// pins the commit each vendored tree came from, and this reports when upstream
// has moved past that pin.
//
// Usage:
//   node scripts/sync-vendored-upstreams.mjs           # report drift only
//   node scripts/sync-vendored-upstreams.mjs --write   # update the manifest pins
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const manifestPath = resolve(root, "config/vendored-skills.manifest.json");
const write = process.argv.includes("--write");

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const token = process.env.GITHUB_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN;

async function latestCommit(repo, ref) {
  const url = `https://api.github.com/repos/${repo}/commits/${ref}`;
  const headers = { Accept: "application/vnd.github+json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`${repo}@${ref}: HTTP ${response.status} ${await response.text()}`);
  }
  const body = await response.json();
  return {
    sha: body.sha,
    date: body.commit?.committer?.date ?? null,
  };
}

const drift = [];
const failures = [];

for (const source of manifest.sources) {
  const slug = source.repo.replace(/^https:\/\/github\.com\//, "");
  try {
    const latest = await latestCommit(slug, source.ref ?? "main");
    const pinned = source.commit ?? null;
    if (pinned !== latest.sha) {
      drift.push({
        id: source.id,
        repo: source.repo,
        ref: source.ref ?? "main",
        pinned,
        latest: latest.sha,
        latest_date: latest.date,
      });
      if (write) {
        source.commit = latest.sha;
        source.commit_date = latest.date;
      }
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
      updated: write ? drift.length : 0,
      drift,
      failures,
    },
    null,
    2,
  ),
);

if (failures.length > 0) process.exitCode = 1;
