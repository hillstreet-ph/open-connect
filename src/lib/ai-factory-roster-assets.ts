/**
 * Static-asset resolution for the AI Factory roster sub-site.
 *
 * The roster is a self-contained static site (9 HTML pages + assets/, data/,
 * images/) that ships inside the deployment bundle under
 * `public/ai-factory/roster/` (see `scripts/unpack-ai-factory-roster.mjs`). It is
 * NOT a TanStack route, so any request the SPA router sees ends as a 404 shell.
 *
 * Without an explicit passthrough the platform's static-asset layer resolves
 * only exact file paths: `/ai-factory/roster/index.html`, `/ai-factory/roster/
 * assets/site.css` and `/ai-factory/roster/data/catalog-v11.json` are served,
 * while the extensionless form of every sibling page (`/ai-factory/roster/teams`,
 * plus the `.html` form after its trailing-`.html` redirect) falls through to the
 * app router and 404s. That is the failure PR #854 shipped.
 *
 * These helpers let the worker resolve the roster's page files explicitly so all
 * nine pages serve real HTML at their own URLs, without touching SPA routing for
 * any other path.
 */

/** Directory that holds the roster's static files, with a trailing slash. */
export const ROSTER_PREFIX = "/ai-factory/roster/";

/**
 * Where each legacy `/ai-factory?view=…` value now lives inside the merged
 * platform.
 *
 * The `/ai-factory` SPA used to be a separate page with its own view switch.
 * Its content is now part of the one roster platform, so every old view value
 * has to land on the section that carries that content. `teams` is the SPA's
 * private team workspace, which is NOT the roster's 103-agent `teams` view —
 * it is the Team Builder, so it maps to `team-builder`.
 */
const LEGACY_VIEW_TARGETS: Record<string, string> = {
  teams: "team-builder",
  roster: "",
  workforce: "workforce",
  agents: "workforce",
  directory: "workforce",
  "team-builder": "team-builder",
  builder: "team-builder",
  niches: "niches",
  playbooks: "playbooks",
  hub: "hub",
  "command-center": "command-center",
  connectors: "connectors",
  registry: "registry",
  studio: "studio",
  overview: "",
  index: "",
};

/**
 * Resolve a legacy `/ai-factory` URL to the merged platform URL that now holds
 * its content, or `null` when the request is not a legacy SPA URL.
 *
 * Only the bare `/ai-factory` path is handled. `/ai-factory/roster/...` and
 * `/ai-factory/mcp` are real endpoints and must not be redirected.
 *
 * A `?agent=` or `?chat=` selection is carried across to the Workforce view,
 * because that is where a specialist is now opened; `?project=` is dropped
 * because the merged platform has no project scope switch.
 */
export function legacyFactoryRedirect(url: URL): string | null {
  if (url.pathname !== "/ai-factory" && url.pathname !== "/ai-factory/") return null;

  const view = (url.searchParams.get("view") ?? "").toLowerCase();
  const agent = url.searchParams.get("agent");
  const chat = url.searchParams.get("chat");

  // A specialist selection always belongs to the Workforce view, whatever the
  // view value says — that is the only place a specialist can be opened.
  let target: string;
  if (agent || chat) target = "workforce";
  else if (view && view in LEGACY_VIEW_TARGETS) target = LEGACY_VIEW_TARGETS[view] ?? "";
  else target = "";

  const path = target ? `${ROSTER_PREFIX}${target}` : ROSTER_PREFIX;
  const params = new URLSearchParams();
  if (agent) params.set("agent", agent);
  if (chat) params.set("chat", chat);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

/** True when `pathname` addresses the roster sub-site (not the app). */
export function isRosterPath(pathname: string): boolean {
  return pathname === "/ai-factory/roster" || pathname.startsWith(ROSTER_PREFIX);
}

/**
 * True when `pathname` looks like a request for a *page* (no file extension) or
 * for a `.html` page. Asset requests such as `assets/site.css` or
 * `data/catalog-v11.json` are served directly by the asset layer and are left
 * alone.
 */
function isPageRequest(pathname: string): boolean {
  if (!pathname.startsWith(ROSTER_PREFIX)) return false;
  const rest = pathname.slice(ROSTER_PREFIX.length);
  if (rest === "") return true;
  if (rest.endsWith("/")) return true;
  const lastSegment = rest.split("/").pop() ?? "";
  // No dot -> clean URL for a page. A trailing `.html` is already an exact file.
  return !lastSegment.includes(".") || lastSegment.endsWith(".html");
}

/**
 * Candidate asset paths to try, in order, for a roster page request.
 *
 * - `/ai-factory/roster/`            -> `index.html`
 * - `/ai-factory/roster/teams`       -> `teams.html`
 * - `/ai-factory/roster/teams.html`  -> `teams.html` (exact file)
 * - `/ai-factory/roster/v2/page`     -> `v2/page.html`
 *
 * Returns an empty list for anything outside the roster or for real asset
 * requests, so the caller can fall straight through to normal routing.
 */
export function rosterPageCandidates(pathname: string): string[] {
  // Normalize `/ai-factory/roster` (no trailing slash) to the directory form
  // before any prefix-based check.
  const normalized = pathname === "/ai-factory/roster" ? ROSTER_PREFIX : pathname;

  if (!isPageRequest(normalized)) return [];

  const candidates: string[] = [];

  if (normalized.endsWith(".html")) {
    candidates.push(normalized);
  } else if (normalized.endsWith("/")) {
    candidates.push(`${normalized}index.html`);
  } else {
    candidates.push(`${normalized}.html`);
    // A page directory may also own an index (kept for future sub-pages).
    candidates.push(`${normalized}/index.html`);
  }

  return candidates;
}
