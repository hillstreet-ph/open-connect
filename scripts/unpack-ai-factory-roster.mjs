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
 * The roster's cross-page links are relative (`teams.html`, `niches.html`, ...),
 * and those pages are static files that must resolve at their own URLs. If the
 * archive ever ships without one of them, the deployed site would answer with
 * the app's SPA shell instead of the page — failing loudly here keeps that from
 * shipping silently.
 */
const REQUIRED_PAGES = [
  "index.html",
  "teams.html",
  "niches.html",
  "playbooks.html",
  "hub.html",
  "studio.html",
  "connectors.html",
  "command-center.html",
  "registry.html",
];
const missing = REQUIRED_PAGES.filter((page) => !existsSync(join(target, page)));
if (missing.length > 0) {
  console.error(`[ai-factory] roster bundle is missing pages: ${missing.join(", ")}`);
  process.exit(1);
}

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

/**
 * Point the roster's own cross-page links at each page's clean URL. Without
 * this every nav click takes a 308 hop (`/teams.html` -> `/teams`) instead of
 * resolving directly, and the extensionless form is the canonical one.
 */
function rewritePageLinks(html) {
  for (const other of pages) {
    const clean = other === "index" ? "" : other;
    html = html.replaceAll(`href="${other}.html"`, `href="/ai-factory/roster/${clean}"`);
  }
  return html;
}

/**
 * Inject `<base href="/ai-factory/roster/">` so the page's relative hrefs/srcs
 * (`assets/`, `images/`, `data/`) resolve from the roster root no matter which
 * URL the page is served at — `/teams`, `/teams/`, `/teams.html` or
 * `/teams/index.html`.
 */
function injectBaseHref(html, page) {
  if (html.includes(BASE_HREF)) return html;
  if (!html.includes("<head>")) {
    console.error(`[ai-factory] ${page}.html has no <head>; cannot inject base href`);
    process.exit(1);
  }
  return html.replace("<head>", `<head>\n${BASE_HREF}`);
}

for (const page of pages) {
  const source = join(target, `${page}.html`);
  const html = injectBaseHref(rewritePageLinks(readFileSync(source, "utf8")), page);

  // Rewrite the page in place: the `.html` file is what the `_redirects`
  // 200-rewrite below serves, so it must carry the base href itself.
  writeFileSync(source, html);

  // `index.html` already serves `/ai-factory/roster/` as the directory index, so
  // it needs no `<page>/index.html` twin. Emitting one would create a stray
  // `/ai-factory/roster/index/` URL that duplicates the roster root.
  if (page === "index") continue;

  const pageDir = join(target, page);
  mkdirSync(pageDir, { recursive: true });
  writeFileSync(join(pageDir, "index.html"), html);
}

/**
 * Cloudflare Pages rewrites `/page.html` -> `/page` (308) and `/page/` ->
 * `/page` (307) at the asset layer, *before* the worker runs, so a directory
 * index alone can never be reached: the trailing slash is stripped first and
 * the extensionless URL has no file. A `200` rewrite in `_redirects` is applied
 * before that asset resolution, so it serves the page's real HTML at its clean
 * URL without a redirect hop.
 */
const redirects = pages
  .flatMap((page) => {
    const target = `/ai-factory/roster/${page}.html`;
    // The roster root is already the directory index; only the extensionless
    // form needs a rewrite, and `/ai-factory/roster//` would be a malformed rule.
    if (page === "index") return [`/ai-factory/roster /ai-factory/roster/index.html 200`];
    return [
      `/ai-factory/roster/${page} ${target} 200`,
      `/ai-factory/roster/${page}/ ${target} 200`,
    ];
  })
  .join("\n");

writeFileSync(join(root, "public", "_redirects"), `${redirects}\n`);

console.log(
  `[ai-factory] roster unpacked to public/ai-factory/roster ` +
    `(${pages.length} pages verified, each served at /ai-factory/roster/<page>)`,
);
