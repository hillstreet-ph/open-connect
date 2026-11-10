#!/usr/bin/env node
/**
 * Generates portable, machine-readable exports for every AI Factory agent.
 *
 * The roster is consumable only inside open-connect: the seven-field schema
 * lives in `data/agents-v10.json` and is rendered by the roster's own drawer.
 * Nothing about it can be taken into ChatGPT, Claude, Hermes or another agent
 * runtime. This script closes that gap by emitting, for all 103 agents:
 *
 *   neutral/  <slug>.json   the seven fields + team, niche, slug, avatar
 *   chatgpt/  <slug>.json   custom-GPT instructions + (honest) action list
 *   claude/   <slug>.json   system prompt + tool_use defs + MCP server entry
 *   hermes/   <slug>.json   agent config for the Hermes runtime
 *   prompt/   <slug>.md     plain-text system prompt for prompt-only runtimes
 *
 * plus `index.json` (the manifest), `mcp/manifest.json` and `openapi.json`.
 *
 * HONESTY RULE (inherited from the roster's connector rule): an agent's
 * `tools` array in the source data holds *internal capability ids*, not
 * callable functions, and most connectors are `available`/`planned` rather
 * than `live`. So every export emits an EMPTY callable-tool list and states
 * why. No export invents a tool definition for a connector that is not live.
 *
 * Runs after `unpack-ai-factory-roster.mjs` (see the `prebuild` script), so it
 * reads the unpacked roster and writes into it. Idempotent: re-running strips
 * the previously injected card blocks before re-injecting them.
 *
 * Usage:
 *   node scripts/generate-ai-factory-exports.mjs
 *   node scripts/generate-ai-factory-exports.mjs --check   # verify, write nothing
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const roster = join(root, "public", "ai-factory", "roster");
const dataDir = join(roster, "data");
const exportsDir = join(dataDir, "exports");
const CHECK = process.argv.includes("--check");

const SITE = "https://open-connect.site";
const ROSTER_URL = `${SITE}/ai-factory/roster/`;
const EXPORT_BASE = `${ROSTER_URL}data/exports/`;
const MCP_URL = `${SITE}/ai-factory/mcp`;

const FORMATS = ["neutral", "chatgpt", "claude", "hermes", "prompt"];

if (!existsSync(join(dataDir, "agents-v10.json"))) {
  console.error("[ai-factory-exports] roster not unpacked; run unpack-ai-factory-roster.mjs first");
  process.exit(1);
}

const agents = JSON.parse(readFileSync(join(dataDir, "agents-v10.json"), "utf8"));
const teamsPath = join(roster, "import", "teams.json");
const teams = existsSync(teamsPath) ? JSON.parse(readFileSync(teamsPath, "utf8")) : [];

/** team id -> team record */
const teamById = new Map(teams.map((t) => [t.id, t]));
/** team name -> team id (niches.html lists teams by display name) */
const teamIdByName = new Map(teams.map((t) => [t.name, t.id]));
/** agent slug -> [team ids] */
const teamsByAgent = new Map();
for (const t of teams) {
  for (const slug of t.agents || []) {
    if (!teamsByAgent.has(slug)) teamsByAgent.set(slug, []);
    teamsByAgent.get(slug).push(t.id);
  }
}

/**
 * niche slug -> [team ids], parsed from niches.html.
 *
 * The niche pages are the only place the niche/team relationship is recorded,
 * so it is read from the rendered HTML rather than guessed from `department`.
 * An agent's niches are therefore the niches of the teams it belongs to.
 */
function parseNicheTeams() {
  const file = join(roster, "niches.html");
  if (!existsSync(file)) return new Map();
  const html = readFileSync(file, "utf8");
  const out = new Map();
  const cardRe =
    /<article class="niche-card[^"]*" data-niche="([^"]+)"[\s\S]*?<div class="niche-teams">([\s\S]*?)<\/div>/g;
  let m;
  while ((m = cardRe.exec(html))) {
    const niche = m[1];
    const names = m[2]
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    out.set(niche, names.map((n) => teamIdByName.get(n)).filter(Boolean));
  }
  return out;
}
const nicheTeams = parseNicheTeams();

/** agent slug -> [niche slugs] */
function nichesFor(slug) {
  const tids = teamsByAgent.get(slug) || [];
  const out = [];
  for (const [niche, ids] of nicheTeams) {
    if (ids.some((id) => tids.includes(id))) out.push(niche);
  }
  return out.sort();
}

function avatarFor(slug) {
  const rel = `images/agents/${slug}.webp`;
  return existsSync(join(roster, rel)) ? rel : null;
}

function liveConnectors(a) {
  return (a.connectors || []).filter((c) => c.status === "live");
}

/** The seven fields, plus the portability metadata every runtime needs. */
function buildNeutral(slug, a) {
  const tids = teamsByAgent.get(slug) || [];
  const primary = tids.length ? teamById.get(tids[0]) : null;
  const live = liveConnectors(a);
  return {
    schema: "open-connect.ai-factory.agent/v1",
    slug,
    name: a.name,
    description: a.description,
    instruction: a.instruction,
    knowledge: a.knowledge || [],
    knowledge_files: (a.knowledgeFiles || []).map((f) => ({
      name: f.name,
      type: f.type,
      size: f.size,
    })),
    tools: (a.tools || []).map((t) => ({
      id: t.id,
      label: t.label,
      description: t.description || "",
    })),
    skills: (a.skills || []).map((s) => ({
      id: s.id,
      label: s.label,
      description: s.description || "",
    })),
    connectors: (a.connectors || []).map((c) => ({
      id: c.id,
      label: c.label,
      status: c.status,
      provider: c.provider,
    })),
    team: primary
      ? { id: primary.id, name: primary.name, category: primary.category, layer: primary.layer }
      : null,
    teams: tids,
    niche: nichesFor(slug)[0] || null,
    niches: nichesFor(slug),
    department: a.department || null,
    driver: a.driver || null,
    avatar: avatarFor(slug),
    version: a.version ?? null,
    capabilities: {
      live_connectors: live.length,
      total_connectors: (a.connectors || []).length,
      has_live_connectors: live.length > 0,
      callable_tools: 0,
    },
    source: `${ROSTER_URL}teams#${slug}`,
    license: "See https://github.com/hillstreet-ph/open-connect",
  };
}

const NO_TOOLS_NOTE =
  "This agent declares no callable tools. Its `tools` field lists internal " +
  "capability ids, not function definitions, and its connectors are not all " +
  "live in this workspace. Emitting a tool definition here would claim a " +
  "capability the agent does not have.";

function buildChatGPT(slug, a, neutral) {
  const live = liveConnectors(a);
  return {
    format: "chatgpt.custom-gpt/v1",
    slug,
    name: a.name,
    description: a.description,
    instructions: a.instruction,
    conversation_starters: [
      `What can you do as ${a.name}?`,
      `Walk me through how you would handle a typical ${a.department || "agency"} task.`,
    ],
    capabilities: { web_browsing: false, code_interpreter: false, image_generation: false },
    actions: [],
    knowledge_files: neutral.knowledge_files,
    notes: [
      NO_TOOLS_NOTE,
      live.length
        ? `Live connectors in the source workspace: ${live.map((c) => c.label).join(", ")}. Wire these as Actions yourself; this export does not ship credentials.`
        : "No connectors are live for this agent in the source workspace.",
      `Portable MCP endpoint: ${MCP_URL} (tools: ai_factory_list_agents, ai_factory_get_agent, ai_factory_get_export).`,
    ],
  };
}

function buildClaude(slug, a, neutral) {
  return {
    format: "claude.agent/v1",
    slug,
    name: a.name,
    system_prompt: a.instruction,
    tools: [],
    mcp_servers: [
      {
        name: "open-connect-ai-factory",
        type: "http",
        url: MCP_URL,
        description: "Read-only access to the AI Factory roster and per-agent exports.",
      },
    ],
    knowledge: neutral.knowledge,
    notes: [NO_TOOLS_NOTE],
  };
}

function buildHermes(slug, a, neutral) {
  return {
    format: "hermes.agent/v1",
    slug,
    name: a.name,
    description: a.description,
    system_prompt: a.instruction,
    tools: [],
    skills: neutral.skills.map((s) => s.id),
    model_hint: "any instruction-following chat model",
    notes: [NO_TOOLS_NOTE],
  };
}

function buildPrompt(slug, a, neutral) {
  const lines = [];
  lines.push("---");
  lines.push(`name: ${a.name}`);
  lines.push(`slug: ${slug}`);
  lines.push(`description: ${JSON.stringify(a.description)}`);
  if (neutral.team) lines.push(`team: ${JSON.stringify(neutral.team.name)}`);
  if (neutral.niche) lines.push(`niche: ${neutral.niche}`);
  lines.push(`source: ${neutral.source}`);
  lines.push("---");
  lines.push("");
  lines.push(`# ${a.name}`);
  lines.push("");
  lines.push(a.description);
  lines.push("");
  lines.push("## System prompt");
  lines.push("");
  lines.push(a.instruction);
  lines.push("");
  if (neutral.knowledge.length) {
    lines.push("## Knowledge");
    lines.push("");
    for (const k of neutral.knowledge) lines.push(`- ${k}`);
    lines.push("");
  }
  if (neutral.skills.length) {
    lines.push("## Skills");
    lines.push("");
    for (const s of neutral.skills) lines.push(`- ${s.label} (\`${s.id}\`)`);
    lines.push("");
  }
  lines.push("## Connectors");
  lines.push("");
  if (neutral.connectors.length) {
    for (const c of neutral.connectors) lines.push(`- ${c.label} — ${c.status}`);
  } else {
    lines.push("- none requested");
  }
  lines.push("");
  lines.push("> Only `live` means the provider is genuinely connected. This agent");
  lines.push("> declares no callable tools; do not assume it can act on any connector.");
  lines.push("");
  return lines.join("\n");
}

function buildIndex(entries) {
  return {
    schema: "open-connect.ai-factory.export-index/v1",
    generated_at: new Date().toISOString(),
    count: entries.length,
    formats: FORMATS,
    base: EXPORT_BASE,
    mcp_endpoint: MCP_URL,
    openapi: `${EXPORT_BASE}openapi.json`,
    agents: entries,
  };
}

function buildMcpManifest() {
  return {
    schema: "open-connect.ai-factory.mcp-manifest/v1",
    name: "open-connect-ai-factory",
    version: "1.0.0",
    description:
      "Read-only MCP access to the Open-Connect AI Factory roster: 103 agents with their seven-field schema and portable exports.",
    transport: { type: "http", url: MCP_URL, protocol: "json-rpc-2.0" },
    tools: [
      {
        name: "ai_factory_list_agents",
        description: "List all AI Factory agents (slug, name, description, team, niche).",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
      },
      {
        name: "ai_factory_get_agent",
        description: "Fetch one agent's neutral seven-field export by slug.",
        inputSchema: {
          type: "object",
          properties: { slug: { type: "string", description: "Agent slug, e.g. account-manager" } },
          required: ["slug"],
          additionalProperties: false,
        },
      },
      {
        name: "ai_factory_get_export",
        description: "Fetch one agent's export in a specific runtime format.",
        inputSchema: {
          type: "object",
          properties: {
            slug: { type: "string" },
            format: { type: "string", enum: FORMATS },
          },
          required: ["slug", "format"],
          additionalProperties: false,
        },
      },
    ],
    limits: [
      "Read-only. No agent can be executed through this endpoint.",
      "No credentials are served; connector status is reported, not granted.",
      "Stateless: no session, no auth, public roster data only.",
    ],
  };
}

function buildOpenApi() {
  return {
    openapi: "3.1.0",
    info: {
      title: "Open-Connect AI Factory — Agent Export API",
      version: "1.0.0",
      description:
        "Static, read-only JSON exports for every AI Factory agent. Every path is a plain GET returning a JSON document; no auth, no backend state.",
    },
    servers: [{ url: SITE }],
    paths: {
      "/ai-factory/roster/data/exports/index.json": {
        get: {
          operationId: "listExports",
          summary: "Manifest of all agents and their export URLs",
          responses: { 200: { description: "Export index" } },
        },
      },
      "/ai-factory/roster/data/exports/{format}/{slug}.json": {
        get: {
          operationId: "getExport",
          summary: "One agent's export in a given format",
          parameters: [
            {
              name: "format",
              in: "path",
              required: true,
              schema: { type: "string", enum: FORMATS },
            },
            { name: "slug", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            200: { description: "Agent export" },
            404: { description: "Unknown agent or format" },
          },
        },
      },
      "/ai-factory/mcp": {
        post: {
          operationId: "mcp",
          summary: "MCP JSON-RPC endpoint (initialize, tools/list, tools/call)",
          responses: { 200: { description: "JSON-RPC response" } },
        },
      },
    },
  };
}

/* ------------------------------------------------------------------ */
/* Card injection: a "Use this agent in…" block on every roster card.  */
/* ------------------------------------------------------------------ */

const USE_BLOCK_RE = /\n?<div class="pf-use"[\s\S]*?<\/div>\n?/g;

function useBlock(slug) {
  const base = `${EXPORT_BASE}`;
  const links = [
    ["JSON", `${base}neutral/${slug}.json`],
    ["ChatGPT", `${base}chatgpt/${slug}.json`],
    ["Claude", `${base}claude/${slug}.json`],
    ["Hermes", `${base}hermes/${slug}.json`],
    ["Prompt", `${base}prompt/${slug}.md`],
  ];
  const items = links
    .map(
      ([label, url]) =>
        `<a class="pf-use-link" href="${url}" download data-copy="${url}" title="Download or copy the ${label} export">${label}</a>`,
    )
    .join("");
  return (
    `\n    <div class="pf-use">` +
    `<span class="pf-use-key">Use in</span>` +
    `<span class="pf-use-links">${items}</span>` +
    `</div>`
  );
}

function injectCards(html) {
  html = html.replace(USE_BLOCK_RE, "\n");
  const parts = html.split('<article class="agent-card"');
  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i];
    const end = chunk.indexOf("</article>");
    if (end === -1) continue;
    const body = chunk.slice(0, end);
    const m = body.match(/<span class="agent-id">([^<]+)<\/span>/);
    if (!m) continue;
    const slug = m[1].trim();
    if (!agents[slug]) continue;
    // Insert after the agent-foot row, still inside .agent-body.
    const footEnd = body.lastIndexOf("</div>");
    if (footEnd === -1) continue;
    const injected = body.slice(0, footEnd) + useBlock(slug) + body.slice(footEnd);
    parts[i] = injected + chunk.slice(end);
  }
  return parts.join('<article class="agent-card"');
}

const PORTABILITY_CSS = `/* AI Factory — portable export controls */
.pf-use{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.07)}
.pf-use-key{font:500 10px/1 "JetBrains Mono",monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--muted,#7c8b99)}
.pf-use-links{display:flex;flex-wrap:wrap;gap:4px}
.pf-use-link{font:500 10px/1 "JetBrains Mono",monospace;padding:4px 7px;border-radius:5px;border:1px solid rgba(15,214,206,.28);color:#0fd6ce;text-decoration:none;background:rgba(15,214,206,.06);transition:background .15s,border-color .15s}
.pf-use-link:hover,.pf-use-link:focus-visible{background:rgba(15,214,206,.16);border-color:rgba(15,214,206,.55);outline:none}
.pf-use-link.copied{background:rgba(45,212,191,.22);border-color:#2dd4bf;color:#2dd4bf}
`;

const PORTABILITY_JS = `/* AI Factory — copy-to-clipboard for portable exports */
(function () {
  "use strict";
  function flash(el, text) {
    var prev = el.textContent;
    el.textContent = text;
    el.classList.add("copied");
    setTimeout(function () { el.textContent = prev; el.classList.remove("copied"); }, 1200);
  }
  document.addEventListener("click", function (e) {
    var a = e.target.closest ? e.target.closest("[data-copy]") : null;
    if (!a) return;
    // Let the download proceed; also copy the URL so it can be pasted into a runtime.
    var url = a.getAttribute("data-copy");
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(url).then(function () { flash(a, "Copied"); }).catch(function () {});
  });
})();
`;

/* ------------------------------------------------------------------ */

const entries = [];
const files = new Map(); // relative path -> content

for (const slug of Object.keys(agents).sort()) {
  const a = agents[slug];
  const neutral = buildNeutral(slug, a);
  files.set(`neutral/${slug}.json`, JSON.stringify(neutral, null, 2) + "\n");
  files.set(`chatgpt/${slug}.json`, JSON.stringify(buildChatGPT(slug, a, neutral), null, 2) + "\n");
  files.set(`claude/${slug}.json`, JSON.stringify(buildClaude(slug, a, neutral), null, 2) + "\n");
  files.set(`hermes/${slug}.json`, JSON.stringify(buildHermes(slug, a, neutral), null, 2) + "\n");
  files.set(`prompt/${slug}.md`, buildPrompt(slug, a, neutral));

  entries.push({
    slug,
    name: a.name,
    description: a.description,
    team: neutral.team ? neutral.team.id : null,
    niche: neutral.niche,
    driver: neutral.driver,
    live_connectors: neutral.capabilities.live_connectors,
    urls: {
      neutral: `${EXPORT_BASE}neutral/${slug}.json`,
      chatgpt: `${EXPORT_BASE}chatgpt/${slug}.json`,
      claude: `${EXPORT_BASE}claude/${slug}.json`,
      hermes: `${EXPORT_BASE}hermes/${slug}.json`,
      prompt: `${EXPORT_BASE}prompt/${slug}.md`,
    },
  });
}

files.set("index.json", JSON.stringify(buildIndex(entries), null, 2) + "\n");
files.set("mcp/manifest.json", JSON.stringify(buildMcpManifest(), null, 2) + "\n");
files.set("openapi.json", JSON.stringify(buildOpenApi(), null, 2) + "\n");

if (CHECK) {
  let bad = 0;
  for (const [rel, content] of files) {
    const p = join(exportsDir, rel);
    if (!existsSync(p)) {
      console.error(`[ai-factory-exports] missing ${rel}`);
      bad++;
      continue;
    }
    const onDisk = readFileSync(p, "utf8");
    if (rel === "index.json") continue; // generated_at differs by design
    if (onDisk !== content) {
      console.error(`[ai-factory-exports] stale ${rel}`);
      bad++;
    }
  }
  if (bad) process.exit(1);
  console.log(`[ai-factory-exports] ${files.size} files up to date`);
  process.exit(0);
}

rmSync(exportsDir, { recursive: true, force: true });
for (const [rel, content] of files) {
  const p = join(exportsDir, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
}

// Inject the per-card "Use in" block and the copy handler into every page that
// renders agent cards.
const pages = readdirSync(roster).filter((n) => n.endsWith(".html"));
let injected = 0;
for (const page of pages) {
  const p = join(roster, page);
  const html = readFileSync(p, "utf8");
  if (!html.includes('class="agent-card"')) continue;
  const next = injectCards(html);
  if (next !== html) {
    writeFileSync(p, next);
    injected++;
  }
}

writeFileSync(join(roster, "assets", "portability.css"), PORTABILITY_CSS);
writeFileSync(join(roster, "assets", "portability.js"), PORTABILITY_JS);

// Link the assets from every page that has cards.
for (const page of pages) {
  const p = join(roster, page);
  let html = readFileSync(p, "utf8");
  if (!html.includes('class="agent-card"')) continue;
  let changed = false;
  if (!html.includes("assets/portability.css")) {
    html = html.replace(
      "</head>",
      '<link rel="stylesheet" href="assets/portability.css">\n</head>',
    );
    changed = true;
  }
  if (!html.includes("assets/portability.js")) {
    html = html.replace("</body>", '<script src="assets/portability.js" defer></script>\n</body>');
    changed = true;
  }
  if (changed) writeFileSync(p, html);
}

console.log(
  `[ai-factory-exports] ${entries.length} agents x ${FORMATS.length} formats = ${files.size} files; ` +
    `card blocks injected into ${injected} pages`,
);
