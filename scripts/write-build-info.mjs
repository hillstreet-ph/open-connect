#!/usr/bin/env node
/**
 * Emit `public/build-info.json` describing the commit this build came from.
 *
 * Why this exists
 * ---------------
 * Before this file, production had no way to state which commit it was
 * serving. A merge could fail to deploy and every existing check would still
 * pass, because they only asserted that *some* build answered. The post-merge
 * gate in `.github/workflows/deploy-verify.yml` compares the `commit` field
 * here against `main` HEAD, which is what turns "merged" into a claim that can
 * actually be falsified.
 *
 * Commit resolution order (first non-empty wins):
 *   1. CF_PAGES_COMMIT_SHA  — set by Cloudflare Pages for Git-integration builds
 *   2. GITHUB_SHA           — set by GitHub Actions
 *   3. `git rev-parse HEAD` — local builds
 *
 * The file is written into `public/` so it is copied verbatim into the build
 * output and served at `/build-info.json`. It is gitignored: it describes a
 * build, so it must never be committed and must never be stale in the tree.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outFile = resolve(repoRoot, "public/build-info.json");

function fromGit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

const commit =
  (process.env.CF_PAGES_COMMIT_SHA || "").trim() ||
  (process.env.GITHUB_SHA || "").trim() ||
  fromGit();

const branch =
  (process.env.CF_PAGES_BRANCH || "").trim() || (process.env.GITHUB_REF_NAME || "").trim() || "";

const info = {
  commit: commit || "unknown",
  short: commit ? commit.slice(0, 10) : "unknown",
  branch,
  // Which system produced this build. Lets the gate tell a Pages build apart
  // from a local or CI-only build when diagnosing a mismatch.
  source: process.env.CF_PAGES_COMMIT_SHA
    ? "cloudflare-pages"
    : process.env.GITHUB_SHA
      ? "github-actions"
      : "local",
  built_at: new Date().toISOString(),
};

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, `${JSON.stringify(info, null, 2)}\n`, "utf8");

console.log(`build-info: commit=${info.short} source=${info.source} branch=${info.branch || "-"}`);

if (!commit) {
  // Not fatal: a local build without git still produces a usable bundle. The
  // post-merge gate is what refuses to accept an unidentifiable production.
  console.warn("build-info: WARNING no commit SHA resolved; wrote 'unknown'");
}
