#!/usr/bin/env node
/**
 * Unpacks the AI Factory roster bundle into public/ai-factory/roster/.
 *
 * The roster is a static, self-contained site (9 pages, data JSON, agent
 * avatars). It is committed as a single zip so the repository stays readable
 * and the build does not carry 120+ generated files in version control.
 *
 * Runs automatically via the `prebuild` script. Safe to run repeatedly: the
 * target directory is replaced only after a successful extraction.
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const archive = join(root, "scripts", "ai-factory-roster.zip");
const target = join(root, "public", "ai-factory", "roster");
const staging = `${target}.unpacking`;

if (!existsSync(archive)) {
  console.log("[ai-factory] no roster bundle present, skipping unpack");
  process.exit(0);
}

rmSync(staging, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });

try {
  execFileSync("unzip", ["-q", "-o", archive, "-d", staging], { stdio: "inherit" });
} catch (error) {
  rmSync(staging, { recursive: true, force: true });
  console.error("[ai-factory] failed to unpack roster bundle", error);
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
renameSync(staging, target);

/**
 * Make every roster page reachable at its own clean URL.
 *
 * The roster links between pages with relative hrefs (`teams.html`,
 * `niches.html`, ...) and Cloudflare Pages serves static files by *exact*
 * path. `/ai-factory/roster/` works because it maps to the directory index, but
 * `/ai-factory/roster/teams` had no file and no route, so it fell through to the
 * app's SPA 404 shell. A `_redirects` 200-rewrite cannot fix this -- the asset
 * layer answers the extensionless URL with a 308 before redirect rules apply.
 *
 * A directory index is served natively, so emit `<page>/index.html` beside each
 * `<page>.html` and inject `<base href="/ai-factory/roster/">` so the page's
 * relative hrefs/srcs still resolve from the parent directory.
 */
const BASE_HREF = '<base href="/ai-factory/roster/">';
const pages = readdirSync(target)
  .filter((name) => name.endsWith(".html"))
  .map((name) => name.slice(0, -".html".length));

for (const page of pages) {
  const pageDir = join(target, page);
  mkdirSync(pageDir, { recursive: true });

  let html = readFileSync(join(target, `${page}.html`), "utf8");

  // Point the roster's own cross-page links at each page's clean URL. Without
  // this every nav click takes a 308 hop (`/teams.html` -> `/teams`) instead of
  // resolving directly, and the extensionless form is the canonical one.
  for (const other of pages) {
    const clean = other === "index" ? "" : other;
    html = html.replaceAll(`href="${other}.html"`, `href="/ai-factory/roster/${clean}"`);
  }

  if (!html.includes(BASE_HREF)) {
    if (!html.includes("<head>")) {
      console.error(`[ai-factory] ${page}.html has no <head>; cannot inject base href`);
      process.exit(1);
    }
    // Relative srcs (`assets/`, `images/`, `data/`) must still resolve from the
    // roster root once the page is served from `<page>/index.html`.
    html = html.replace("<head>", `<head>\n${BASE_HREF}`);
  }

  writeFileSync(join(pageDir, "index.html"), html);
}

console.log(
  `[ai-factory] roster unpacked to public/ai-factory/roster ` +
    `(${pages.length} pages, each served at /ai-factory/roster/<page>)`,
);
