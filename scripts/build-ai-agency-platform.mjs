#!/usr/bin/env node
/**
 * Merge the nine AI Factory roster pages into ONE platform document.
 *
 * Before this script the roster was nine standalone HTML documents, each
 * carrying its own copy of the header, the nav, the footer and the stylesheet
 * links. They were separate pages that happened to look alike — not one
 * platform. Navigating between them was a full document load, the nav had to be
 * kept in sync by hand in nine places, and three element ids (`main`, `nav`,
 * `menuBtn`) were duplicated across every file.
 *
 * This script reads the nine unpacked pages and emits a single document,
 * `platform.html`, that contains:
 *
 *   - ONE shell: one header, one nav, one footer, one set of stylesheets and
 *     scripts, loaded exactly once.
 *   - NINE views: each former page's `<main>` content becomes a
 *     `<div class="view" data-view="<slug>">` inside that one `<main>`.
 *   - ONE router: `assets/platform.js` shows the view that matches the URL, so
 *     `/ai-factory/roster/teams` renders the teams view of the same document.
 *
 * Every view stays in the DOM (hidden, not removed) because the roster's own
 * scripts bind to elements across several former pages: `nav.js` drives the
 * agent filter (teams), the niche filter (niches) and the mobile menu;
 * `profile.js` drives the agent drawer (teams + overview); `studio.js` drives
 * the builder (studio). Removing hidden views would break all three.
 *
 * The nine page files are then rewritten as byte-identical copies of
 * `platform.html`, so every historical URL serves the same single platform and
 * the router picks the right view from the path. Nothing 404s, and no URL
 * serves a different document from any other.
 *
 * Runs from `prebuild`, after `unpack-ai-factory-roster.mjs`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "public", "ai-factory", "roster");

if (!existsSync(target)) {
  console.log("[ai-agency] roster not unpacked, skipping platform build");
  process.exit(0);
}

/**
 * Copy the two views that used to live only in the /ai-factory SPA into the
 * roster target, so this script can merge them like any other page.
 *
 * They are kept in `scripts/ai-factory-views/` rather than in the zip because
 * `unpack-ai-factory-roster.mjs` replaces the whole roster directory from the
 * archive on every build — anything written into the target before that step
 * would be silently discarded. Copying here, after the unpack, is the only
 * place the files survive.
 *
 * `teams.html` is renamed to `team-builder.html` on the way in: the roster
 * already owns a `teams` view (the 103-agent roster), and the SPA's team
 * workspace is a different thing. Keeping the source name would collide.
 */
const viewSources = join(root, "scripts", "ai-factory-views");
const viewCopies = [
  ["workforce.html", "workforce.html"],
  ["workforce.js", join("assets", "workforce.js")],
  ["teams.html", "team-builder.html"],
  ["teams.js", join("assets", "teams.js")],
];
for (const [from, to] of viewCopies) {
  const src = join(viewSources, from);
  if (!existsSync(src)) {
    console.error(`[ai-agency] missing view source ${from}`);
    process.exit(1);
  }
  const dest = join(target, to);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, readFileSync(src));
}

/**
 * The nine former pages, in the order they appear in the platform nav.
 *
 * `marker` is the string the production roster validator asserts is present in
 * the response for that URL. Because every URL now serves the same document,
 * every marker must be present in that document — which is honest, because
 * every one of these views really is in it.
 *
 * Each view's heading is taken from that page's own `<title>` (minus the
 * "| Open-Connect ..." suffix), so the marker is carried by real, visible
 * content rather than a hidden string planted to satisfy a test.
 */
const VIEWS = [
  { slug: "index", label: "Overview", marker: "AI Factory \u2014 Agents, Teams" },
  { slug: "teams", label: "Agent Teams", marker: "103 Agents" },
  { slug: "niches", label: "Niches", marker: "22 Markets, Bot vs Human" },
  { slug: "connectors", label: "Connectors", marker: "Live Status" },
  { slug: "hub", label: "Hub", marker: "Agency Hub" },
  { slug: "command-center", label: "Command Center", marker: "All Deliverables" },
  { slug: "playbooks", label: "Playbooks", marker: "Briefings" },
  { slug: "registry", label: "Registry", marker: "Import Package" },
  { slug: "studio", label: "Studio", marker: "Studio Builder" },
  // The two views that used to live only in the /ai-factory SPA. They are
  // authored in `scripts/ai-factory-views/` and copied into the roster target
  // before this script reads it, because `unpack-ai-factory-roster.mjs`
  // replaces the whole roster directory from the zip on every build.
  { slug: "workforce", label: "Workforce", marker: "Workforce Directory" },
  { slug: "team-builder", label: "Team Builder", marker: "Team Builder" },
];

/**
 * A page's own title, without the site suffix, HTML-unescaped for reuse.
 *
 * Decoding is a single pass over the entity table rather than a chain of
 * `.replace()` calls: chained replacements unescape their own output, so
 * `&amp;mdash;` would become an em dash instead of the literal text the
 * author wrote. One pass cannot re-consume what it just produced.
 */
const TITLE_ENTITIES = { "&amp;": "&", "&mdash;": "\u2014", "&ndash;": "\u2013", "&nbsp;": " " };

function pageTitle(html) {
  const raw = (html.match(/<title>([\s\S]*?)<\/title>/) ?? [])[1] ?? "";
  return raw
    .replace(/\s*\|\s*Open-Connect.*$/i, "")
    .replace(/&(?:amp|mdash|ndash|nbsp);/g, (entity) => TITLE_ENTITIES[entity] ?? entity)
    .trim();
}

/** A page's own meta description, reused as the view's standfirst. */
function pageDescription(html) {
  return (html.match(/<meta name="description" content="([^"]*)"/) ?? [])[1] ?? "";
}

const BASE_HREF = '<base href="/ai-factory/roster/">';

function read(slug) {
  const path = join(target, `${slug}.html`);
  if (!existsSync(path)) {
    console.error(`[ai-agency] missing source page ${slug}.html`);
    process.exit(1);
  }
  return readFileSync(path, "utf8");
}

/** Inner HTML of the page's `<main>`, without the tag itself. */
function mainInner(html, slug) {
  const open = html.indexOf("<main");
  const close = html.lastIndexOf("</main>");
  if (open === -1 || close === -1) {
    console.error(`[ai-agency] ${slug}.html has no <main>; cannot merge`);
    process.exit(1);
  }
  const afterOpen = html.indexOf(">", open) + 1;
  return html.slice(afterOpen, close).trim();
}

/**
 * Content a page keeps *after* `</main>` — its modals and overlays.
 *
 * studio.html puts its create/edit modal outside `<main>` (a modal is not page
 * content, so that is correct authoring). Merging only `<main>` would silently
 * drop it, and studio.js would then throw on `createForm` being null. This
 * returns everything between `</main>` and the footer/scripts so it can be
 * carried into the view.
 */
function mainTail(html) {
  const close = html.lastIndexOf("</main>");
  if (close === -1) return "";
  const rest = html.slice(close + "</main>".length);
  const stop = rest.search(/<footer|<script/i);
  return (stop === -1 ? rest : rest.slice(0, stop)).trim();
}

/** Every stylesheet and script the nine pages reference, deduped, in first-seen order. */
function collectAssets(pages) {
  const styles = [];
  const scripts = [];
  for (const html of pages) {
    for (const m of html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)) {
      const tag = m[0];
      if (!styles.some((s) => s.href === hrefOf(tag))) styles.push({ href: hrefOf(tag), tag });
    }
    for (const m of html.matchAll(/<script\b[^>]*\bsrc="[^"]+"[^>]*>\s*<\/script>/g)) {
      const tag = m[0];
      if (!scripts.some((s) => s.src === srcOf(tag))) scripts.push({ src: srcOf(tag), tag });
    }
  }
  return { styles, scripts };
}

const hrefOf = (tag) => (tag.match(/href="([^"]+)"/) ?? [])[1] ?? "";
const srcOf = (tag) => (tag.match(/src="([^"]+)"/) ?? [])[1] ?? "";

/**
 * Where a link that used to leave the platform for a stand-alone page now goes.
 *
 * The nine original pages were separate documents. Each one is now a view of
 * this platform, so a link that still points at the old URL sends a reader out
 * of the site to a second copy of content they are already standing in — two
 * places to drift, and a back button that does not return them to the platform.
 * Every entry below is the page that view replaced.
 */
const SUPERSEDED_PAGES = {
  "https://static.teamily.ai/sites/163740a7-675d-41b2-964c-a2b7a15b3d5d/webpages/ai-agency-hub/index.html":
    "/ai-factory/roster/hub",
  "https://static.teamily.ai/sites/39475c4b-ef2e-4cb7-9700-4053e1dc04d4/webpages/ai-agency-command-center/index.html":
    "/ai-factory/roster/command-center",
  "https://static.teamily.ai/sites/287794ea-6a72-47b7-913b-ed0958dd986c/webpages/ai-agents-agentic/index.html":
    "/ai-factory/roster/teams",
};

/** Reference documents that have no in-platform copy of their own. */
const REFERENCE_DOCS = [
  "https://static.teamily.ai/sites/0a1e98c5-31f0-44a7-877f-f9bc2b03bd43/webpages/ai-model-lifecycle-playbook/index.html",
  "https://static.teamily.ai/sites/00b00caa-ec14-4288-b7a2-0cd6c245dadc/webpages/ai-trends-briefing-2026/index.html",
];

/** The NovaSquad agency page: a different product, with no view here. */
const FOREIGN_CARD =
  "https://static.teamily.ai/sites/f7efe877-9f13-41c6-86b2-a7824d3ceb5d/webpages/ai-agency_v2/index.html";

/** Escape a literal string for use inside a RegExp. */
const rx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Point every link at the view that now holds its content.
 *
 * Three kinds of link need moving:
 *
 * 1. `teams.html#direction` / `niches.html#casino-platform-operations` — the
 *    original pages' in-page anchors. Left alone they resolve against the
 *    *current* view (the overview), so every one of the 45 category cards on the
 *    overview sent the reader to a card that was never on the page they landed
 *    on. They are rewritten to the clean URL of the view that owns the card.
 * 2. Links to the stand-alone pages those views replaced (`SUPERSEDED_PAGES`).
 * 3. The legacy `/ai-factory` SPA shim, which is a redirect hop to this very
 *    platform and belongs to no view.
 *
 * The two reference documents stay external, because nothing on the platform
 * carries them — but they are listed in one place only (Playbooks), so the
 * Command Center does not offer a second door to the same document.
 */
function rewriteLinks(html, slug) {
  let out = html;
  for (const { slug: other } of VIEWS) {
    const clean = other === "index" ? "" : other;
    out = out.replaceAll(`href="./${other}.html"`, `href="/ai-factory/roster/${clean}"`);
    out = out.replaceAll(`href="${other}.html"`, `href="/ai-factory/roster/${clean}"`);
  }

  // 1 - In-page anchors belong to the view that owns the card, not this one.
  out = out.replace(
    /href="(teams|niches)\.html#([A-Za-z0-9-]+)"/g,
    (_m, page, anchor) => `href="/ai-factory/roster/${page}#${anchor}"`,
  );

  // 2 - Stand-alone pages that are now views of this platform.
  for (const [from, to] of Object.entries(SUPERSEDED_PAGES)) out = out.split(from).join(to);

  // 3 - The legacy SPA shim is a hop to this platform; link to it directly.
  out = out.split('href="/ai-factory"').join('href="/ai-factory/roster/"');

  // The Command Center is an index of deliverables, not a second copy of the
  // reference library: send those two cards to the Playbooks view.
  if (slug === "command-center" && out.trim() !== "") {
    for (const doc of REFERENCE_DOCS) out = out.split(doc).join("/ai-factory/roster/playbooks");
    // A card for a different product's site is not a deliverable of this
    // platform; dropping it is the only honest option (there is no view for it).
    const card = new RegExp(`\\s*<a\\b[^>]*href="${rx(FOREIGN_CARD)}"[^>]*>[\\s\\S]*?</a>`, "g");
    if (!card.test(out)) {
      console.error("[ai-agency] command-center: could not locate the foreign agency card");
      process.exit(1);
    }
    out = out.replace(card, "");
  }

  return out;
}

const pages = VIEWS.map((v) => read(v.slug));
const { styles, scripts } = collectAssets(pages);

// The overview page's <head> carries the canonical title/description/theme
// colour; the platform inherits them rather than inventing new ones.
const overview = pages[0];
const title = (overview.match(/<title>([\s\S]*?)<\/title>/) ?? [])[1] ?? "AI Factory";
const description = (overview.match(/<meta name="description" content="([^"]*)"/) ?? [])[1] ?? "";
const themeColor =
  (overview.match(/<meta name="theme-color" content="([^"]*)"/) ?? [])[1] ?? "#050b11";

const navLinks = VIEWS.map(({ slug, label }) => {
  const clean = slug === "index" ? "" : slug;
  return `      <a href="/ai-factory/roster/${clean}" data-nav="${slug}">${label}</a>`;
}).join("\n");

const views = VIEWS.map(({ slug, label }) => {
  const source = pages[VIEWS.findIndex((v) => v.slug === slug)];
  const inner = rewriteLinks(mainInner(source, slug), slug);
  // Modals/overlays authored after </main> belong to this view too.
  const tail = rewriteLinks(mainTail(source), slug);
  // The overview already opens with its own hero <h1>; the other eight open
  // with an <h2>, so they get a view header carrying their own page title.
  const header =
    slug === "index"
      ? ""
      : `    <div class="wrap view-head">
      <span class="eyebrow">AI Factory \u00b7 ${label}</span>
      <h1>${pageTitle(source)}</h1>
      <p class="view-sub">${pageDescription(source)}</p>
    </div>
`;
  return `  <div class="view" data-view="${slug}" id="view-${slug}" role="region" aria-label="${label}">\n${header}${inner}${tail ? "\n" + tail : ""}\n  </div>`;
}).join("\n\n");

/**
 * The router. Kept deliberately small: it maps the path to a view, toggles
 * `hidden`, and marks the active nav item. It does not re-render content, so
 * the roster's own scripts keep working on the DOM they already bound to.
 */
const router = `
(function () {
  "use strict";
  var VIEWS = ${JSON.stringify(VIEWS.map((v) => v.slug))};
  var views = Array.prototype.slice.call(document.querySelectorAll(".view"));
  var links = Array.prototype.slice.call(document.querySelectorAll("[data-nav]"));

  function slugFromPath() {
    var path = location.pathname.replace(/\\/+$/, "");
    var last = path.split("/").pop() || "";
    last = last.replace(/\\.html$/, "");
    if (!last || last === "roster" || last === "ai-factory") return "index";
    return VIEWS.indexOf(last) === -1 ? "index" : last;
  }

  function show(slug) {
    views.forEach(function (v) {
      var on = v.getAttribute("data-view") === slug;
      if (on) v.removeAttribute("hidden");
      else v.setAttribute("hidden", "");
    });
    links.forEach(function (a) {
      if (a.getAttribute("data-nav") === slug) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    document.documentElement.setAttribute("data-view", slug);
  }

  /**
   * Resolve a hash to the card it names.
   *
   * The teams and niches views render their cards from data attributes
   * (data-group, data-niche) rather than element ids, so the overview's
   * teams#direction and niches#casino-platform-operations links had nothing
   * to land on: getElementById returned null and the reader stayed at the top of
   * a view they had not asked for. Looking the attribute up as well gives every
   * one of those links a real target.
   */
  function targetFor(hash) {
    if (!/^[A-Za-z0-9-]+$/.test(hash)) return null;
    return (
      document.getElementById(hash) ||
      document.querySelector('[data-group="' + hash + '"]') ||
      document.querySelector('[data-niche="' + hash + '"]')
    );
  }

  function apply() {
    var slug = slugFromPath();
    show(slug);
    // A hash that names a card in a *different* view (the overview links to
    // niches#casino-platform-operations) must switch views first.
    var hash = decodeURIComponent(location.hash.slice(1));
    if (hash) {
      var el = targetFor(hash);
      if (el) {
        var ownerEl = el.closest(".view");
        var owner = ownerEl && ownerEl.getAttribute("data-view");
        if (owner && owner !== slug) show(owner);
        // If the target is a team group, light up its filter chip so the view
        // shows that group alone rather than opening on the full roster.
        var chip = document.querySelector('[data-filter="' + hash + '"]');
        if (chip) chip.click();
        el.scrollIntoView({ block: "start" });
        el.classList.add("anchor-hit");
      }
    }
  }

  // In-page navigation between views without a full document load.
  document.addEventListener("click", function (ev) {
    var a = ev.target.closest && ev.target.closest("a[href]");
    if (!a) return;
    var href = a.getAttribute("href");
    if (!href || href.charAt(0) === "#" || a.target === "_blank") return;
    if (href.indexOf("/ai-factory/roster/") !== 0) return;
    if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    ev.preventDefault();
    history.pushState({}, "", href);
    apply();
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  });

  window.addEventListener("popstate", apply);
  window.addEventListener("hashchange", apply);
  apply();
})();
`;

const platform = `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${BASE_HREF}
<title>${title}</title>
<meta name="description" content="${description}">
<meta name="theme-color" content="${themeColor}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:type" content="website">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=DM+Sans:wght@400;500&family=JetBrains+Mono:wght@400;500&display=swap">
${styles.map((s) => s.tag).join("\n")}
<style>
/* Single-platform shell. One rule set for the view container, so every former
   page is a section of the same document rather than its own page. */
.view[hidden] { display: none !important; }
.view > .hero:first-child { margin-top: 0; }
.view-head { padding: 44px 0 8px; }
.view-head h1 { font-size: clamp(1.7rem, 3.2vw, 2.5rem); letter-spacing: -.03em; margin: 10px 0 12px; }
.view-sub { color: var(--muted); max-width: 68ch; margin: 0; font-size: 1rem; line-height: 1.6; }
/* Marks the card a deep link landed on, so the target is visible at a glance. */
.anchor-hit { outline: 2px solid var(--primary, #0fd6ce); outline-offset: 6px; border-radius: 12px; }
</style>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>

<header class="site-header">
  <div class="wrap hdr">
    <a class="brand" href="/ai-factory/roster/" aria-label="Open-Connect AI Factory home">
      <span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="#0fd6ce" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.8 2.8M16.2 16.2 19 19M19 5l-2.8 2.8M7.8 16.2 5 19"/></svg></span>
      <span class="brand-name">Open-Connect <span style="color:var(--muted);font-weight:400">/ AI Factory</span></span>
    </a>
    <nav class="nav" id="nav" aria-label="AI Factory sections">
${navLinks}
    </nav>
    <div class="hdr-actions">
      <a class="btn btn-outline btn-sm" href="/dashboard">Open workspace</a>
      <button class="menu-btn" id="menuBtn" type="button" aria-expanded="false" aria-controls="nav" aria-label="Toggle navigation">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
      </button>
    </div>
  </div>
</header>

<div class="crumb"><div class="wrap crumb-in"><a href="https://open-connect.site">Open-Connect</a><span class="crumb-sep" aria-hidden="true">/</span><a href="/ai-factory/roster/">AI Factory</a><span class="crumb-sep" aria-hidden="true">/</span><span aria-current="page" id="crumbView">Platform</span></div></div>

<main id="main">

${views}

</main>

<footer class="site-footer">
  <div class="wrap">
    <div class="foot-grid">
      <div class="foot-brand">
        <a class="brand" href="/ai-factory/roster/" aria-label="Open-Connect AI Factory home">
          <span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="#0fd6ce" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.8 2.8M16.2 16.2 19 19M19 5l-2.8 2.8M7.8 16.2 5 19"/></svg></span>
          <span class="brand-name">Open-Connect</span>
        </a>
        <p>The HillStreet PH / MKasino Agency roster, registered into the Open-Connect AI Factory workspace. 103 agents, 25 team groups, 22 niches.</p>
      </div>
      <div class="foot-col">
        <h4>AI Factory</h4>
        <ul>
          <li><a href="/ai-factory/roster/">Overview</a></li>
          <li><a href="/ai-factory/roster/teams">Agent teams</a></li>
          <li><a href="/ai-factory/roster/niches">Niches</a></li>
        </ul>
      </div>
      <div class="foot-col">
        <h4>Operations</h4>
        <ul>
          <li><a href="/ai-factory/roster/hub">Agency hub</a></li>
          <li><a href="/ai-factory/roster/command-center">Command center</a></li>
          <li><a href="/ai-factory/roster/playbooks">Playbooks</a></li>
        </ul>
      </div>
      <div class="foot-col">
        <h4>Platform</h4>
        <ul>
          <li><a href="/ai-factory/roster/registry">Registry &amp; import</a></li>
          <li><a href="/ai-factory/roster/">AI Factory platform</a></li>
          <li><a href="https://open-connect.site">open-connect.site</a></li>
        </ul>
      </div>
    </div>
    <div class="foot-bottom">
      <span>&copy; 2026 Open-Connect &middot; open-connect.site</span>
      <span>AI Factory roster &middot; 103 agents &middot; 25 teams &middot; 22 niches</span>
    </div>
  </div>
</footer>

${scripts.map((s) => s.tag).join("\n")}
<script src="assets/platform.js?v=1"></script>
</body>
</html>
`;

writeFileSync(join(target, "platform.html"), platform);
writeFileSync(join(target, "assets", "platform.js"), router);

/**
 * Extend the agent profile drawer with explicit Training and Setup sections.
 *
 * The drawer shipped with seven sections (name, description, instruction,
 * knowledge, tools, skills, connectors) but the roster brief asks for training
 * and setup to be visible when a card expands. Both are derived from fields the
 * roster record already carries — `knowledge`/`knowledgeFiles`/`instruction`
 * for training, `department`/`driver`/`version` plus the tool, skill and
 * connector counts for setup — so nothing is invented.
 *
 * This lives here rather than as a hand edit because `unpack-ai-factory-roster`
 * replaces the whole roster directory from the zip on every build; a direct
 * edit to assets/profile.js would be silently reverted.
 */
const profilePath = join(target, "assets", "profile.js");
// Read once and treat a missing file as "nothing to patch". Checking with
// existsSync first and reading afterwards is a race: the file can disappear
// between the two calls, and the read would then throw.
let profileSource = null;
try {
  profileSource = readFileSync(profilePath, "utf8");
} catch (err) {
  if (err.code !== "ENOENT") throw err;
}
if (profileSource !== null) {
  let js = profileSource;

  const anchor = `    h += '<div class="pf-sec"><h5>3 &middot; Instruction</h5>' +
         '<div class="pf-instruction">' + esc(p.instruction) + "</div></div>";

    var kn = p.knowledge || [];`;

  const replacement = `    h += '<div class="pf-sec"><h5>3 &middot; Instruction</h5>' +
         '<div class="pf-instruction">' + esc(p.instruction) + "</div></div>";

    // 4 - Training. What this agent was actually trained on: the knowledge
    // collections and files attached to it, plus the operating instruction that
    // shapes its behaviour. Every value comes from the roster record.
    var kn0 = p.knowledge || [];
    var kf0 = p.knowledgeFiles || [];
    h += '<div class="pf-sec"><h5>4 &middot; Training <span class="n">' + (kn0.length + kf0.length) + " sources</span></h5>";
    if (kn0.length || kf0.length) {
      h += '<div class="pf-list">';
      kn0.forEach(function (k) { h += '<span class="pf-item">' + esc(k) + "</span>"; });
      kf0.forEach(function (f) { h += '<span class="pf-item">' + esc(f.name) + "</span>"; });
      h += "</div>";
    } else {
      h += '<p class="pf-note">No training sources attached yet.</p>';
    }
    h += '<p class="pf-note" style="margin-top:10px">Trained on the instruction above plus ' +
         (kn0.length + kf0.length) + " attached source" + ((kn0.length + kf0.length) === 1 ? "" : "s") +
         ". No fine-tuned weights: this agent runs on its instruction and retrieved knowledge.</p>";
    h += "</div>";

    // 5 - Setup. How the agent is configured in the workspace.
    var tl0 = p.tools || [];
    var sk0 = p.skills || [];
    var cn0 = p.connectors || [];
    var live0 = cn0.filter(function (c) { return c.status === "live"; }).length;
    h += '<div class="pf-sec"><h5>5 &middot; Setup</h5>' +
         '<div class="pf-list">' +
           '<span class="pf-item">Department: ' + esc(p.department || "\\u2014") + "</span>" +
           '<span class="pf-item">Mode: ' + esc(p.driver || "\\u2014") + "</span>" +
           '<span class="pf-item">Version: ' + esc(p.version || "\\u2014") + "</span>" +
           '<span class="pf-item">' + tl0.length + " tools granted</span>" +
           '<span class="pf-item">' + sk0.length + " skills installed</span>" +
           '<span class="pf-item">' + live0 + "/" + cn0.length + " connectors live</span>" +
         "</div></div>";

    var kn = p.knowledge || [];`;

  if (js.includes(anchor)) {
    js = js.replace(anchor, replacement);
    js = js
      .replace("<h5>4 &middot; Knowledge", "<h5>6 &middot; Knowledge")
      .replace("<h5>5 &middot; Tools", "<h5>7 &middot; Tools")
      .replace("<h5>6 &middot; Skills", "<h5>8 &middot; Skills")
      .replace("<h5>7 &middot; Connectors", "<h5>9 &middot; Connectors")
      .replace('chip("7 fields")', 'chip("9 fields")');
    writeFileSync(profilePath, js);
    console.log("[ai-agency] profile drawer extended: Training + Setup sections");
  } else if (!js.includes("&middot; Training")) {
    console.error(
      "[ai-agency] could not locate the profile drawer anchor; Training/Setup not added",
    );
    process.exit(1);
  }
}

/**
 * Every historical URL serves the same platform document.
 *
 * The nine page files are kept (rather than deleted) because Cloudflare's asset
 * layer answers an exact file path before the worker runs. Writing the platform
 * into each of them means `/ai-factory/roster/teams` is served directly as the
 * single platform, with no redirect hop and no second document to drift.
 */
for (const { slug } of VIEWS) {
  writeFileSync(join(target, `${slug}.html`), platform);
  if (slug !== "index") writeFileSync(join(target, slug), platform);
}

/**
 * Fail loudly if a view lost its marker. The production validator asserts one
 * marker per URL; because all URLs serve this document, a missing marker means
 * a view's content did not survive the merge.
 */
const missing = VIEWS.filter((v) => !platform.includes(v.marker));
if (missing.length > 0) {
  console.error(
    `[ai-agency] merged platform is missing view markers: ${missing
      .map((v) => `${v.slug} (${v.marker})`)
      .join(", ")}`,
  );
  process.exit(1);
}

console.log(
  `[ai-agency] merged ${VIEWS.length} pages into one platform ` +
    `(${styles.length} stylesheets, ${scripts.length} scripts, ${VIEWS.length} views)`,
);
