#!/usr/bin/env node
/**
 * Generates portable, machine-readable exports for every AI Factory agent.
 *
 * The roster is consumable only inside open-connect: the seven-field schema
 * lives in `data/agents-v10.json` and is rendered by the roster's own drawer.
 * Nothing about it can be taken into ChatGPT, Claude, Hermes or another agent
 * runtime. This script closes that gap by emitting, for all 103 agents:
 *
 *   neutral/  <slug>.json              the seven fields + team, niche, slug, avatar
 *   chatgpt/  <slug>.json              custom-GPT metadata + limits + steps
 *   chatgpt/  <slug>.instructions.txt  the exact text to paste into Instructions
 *   claude/   <slug>.json              Project metadata + MCP connector config
 *   claude/   <slug>.instructions.md   the exact text to paste into a Project
 *   hermes/   <slug>.json              Hermes metadata + steps
 *   hermes/   <slug>.config.yaml       a real `~/.hermes/config.yaml` fragment
 *   hermes/   <slug>.SOUL.md           a real `~/.hermes/SOUL.md` identity file
 *   prompt/   <slug>.md                plain-text system prompt for any runtime
 *   use-in/   <slug>.json              per-target steps, limits and artifact URLs
 *
 * plus `index.json` (the manifest), `mcp/manifest.json` and `openapi.json`.
 *
 * WHY THE EXTRA FILES
 * -------------------
 * A JSON blob is not "copy-paste-ready" in any of these tools. ChatGPT wants
 * text in an Instructions box with an 8,000-character ceiling; Claude wants
 * text in a Project's instructions; Hermes reads YAML from
 * `~/.hermes/config.yaml` and identity from `~/.hermes/SOUL.md`. So each target
 * gets the artifact its own UI actually accepts, and the JSON beside it carries
 * the metadata, the limits and the steps.
 *
 * HONESTY RULE (inherited from the roster's connector rule): an agent's
 * `tools` array in the source data holds *internal capability ids*, not
 * callable functions, and most connectors are `available`/`planned` rather
 * than `live`. So every export emits an EMPTY callable-tool list and states
 * why. No export invents a tool definition for a connector that is not live.
 *
 * Runs after `unpack-ai-factory-roster.mjs` and `build-ai-agency-platform.mjs`
 * (see the `prebuild` script), so it reads the unpacked roster and writes into
 * it. Idempotent: re-running strips the previously injected card blocks before
 * re-injecting them.
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

/**
 * Hard limits of each target, as its own product enforces them.
 *
 * These are asserted at generation time, so an agent whose instruction grows
 * past a target's ceiling fails the build instead of shipping an export the
 * target will silently truncate or refuse to save.
 */
const LIMITS = {
  chatgpt: {
    name: 50,
    description: 300,
    instructions: 8000,
    conversation_starters: 4,
    starter_length: 300,
  },
};

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

/** The shared body of every prompt-shaped artifact. */
function promptBody(slug, a, neutral) {
  const live = liveConnectors(a);
  const lines = [];
  lines.push(`You are ${a.name}, an agent in the Open-Connect AI Agency.`);
  lines.push("");
  lines.push("## Mandate");
  lines.push("");
  lines.push(a.description);
  lines.push("");
  lines.push("## Operating instructions");
  lines.push("");
  lines.push(a.instruction);
  lines.push("");
  if (neutral.knowledge.length) {
    lines.push("## Knowledge you rely on");
    lines.push("");
    for (const k of neutral.knowledge) lines.push(`- ${k}`);
    lines.push("");
    lines.push(
      "These are named working documents, not bundled files. Supply your own " +
        "copies in the host tool's knowledge/project files if you want the agent " +
        "to read them.",
    );
    lines.push("");
  }
  if (neutral.skills.length) {
    lines.push("## Skills you apply");
    lines.push("");
    for (const s of neutral.skills) lines.push(`- ${s.label} (\`${s.id}\`)`);
    lines.push("");
  }
  lines.push("## Connectors");
  lines.push("");
  if (neutral.connectors.length) {
    for (const c of neutral.connectors) lines.push(`- ${c.label} — ${c.status}`);
    lines.push("");
    lines.push(
      live.length
        ? `Live in the source workspace: ${live.map((c) => c.label).join(", ")}. ` +
            "Wiring any of these into this host is your own authorization to make; " +
            "no credentials ship with this export."
        : "No connector is live for this agent in the source workspace.",
    );
  } else {
    lines.push("- none requested");
  }
  lines.push("");
  lines.push("## Boundaries");
  lines.push("");
  lines.push(
    "- Never take an irreversible action, spend money, or make a commitment without explicit human approval.",
  );
  lines.push("- Never claim external execution without a tool receipt.");
  lines.push(
    "- You have no callable tools in this deployment. Do not imply that you can act on a connector.",
  );
  lines.push("");
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* ChatGPT — a custom GPT definition                                   */
/* ------------------------------------------------------------------ */

function chatgptName(a) {
  // The GPT name field is 50 characters. The persona name alone is short, so
  // qualify it with the department only when it still fits.
  const base = a.name;
  const qualified = `${a.name} — ${a.department ? a.department.replace(/-/g, " ") : "AI Agency"}`;
  return (qualified.length <= LIMITS.chatgpt.name ? qualified : base).slice(0, LIMITS.chatgpt.name);
}

function chatgptStarters(a, neutral) {
  const skill = neutral.skills[0] ? neutral.skills[0].label.toLowerCase() : "your core work";
  const starters = [
    `What can you do as ${a.name}?`,
    `Walk me through how you handle ${skill}.`,
    `Draft the first version of a ${a.department || "agency"} deliverable for me.`,
    `What do you need from me before you can start?`,
  ];
  return starters
    .map((s) => s.slice(0, LIMITS.chatgpt.starter_length))
    .slice(0, LIMITS.chatgpt.conversation_starters);
}

function chatgptInstructions(slug, a, neutral) {
  const live = liveConnectors(a);
  const lines = [];
  lines.push(promptBody(slug, a, neutral).trimEnd());
  lines.push("");
  lines.push("## How to respond");
  lines.push("");
  lines.push(
    "- Answer as this agent, in the first person. Do not describe the agent in the third person.",
  );
  lines.push("- Lead with the deliverable, then the reasoning. Keep routine answers short.");
  lines.push("- When a request needs a human decision, say so and name the decision.");
  lines.push(
    "- If you are asked to do something outside the mandate above, decline and explain the boundary.",
  );
  lines.push("");
  if (live.length) {
    lines.push(
      `This GPT ships no Actions. If you want it to reach ${live
        .map((c) => c.label)
        .join(", ")}, add an Action yourself and supply your own credentials.`,
    );
    lines.push("");
  }
  return lines.join("\n");
}

function buildChatGPT(slug, a, neutral) {
  const live = liveConnectors(a);
  const instructions = chatgptInstructions(slug, a, neutral);
  return {
    format: "chatgpt.custom-gpt/v1",
    slug,
    name: chatgptName(a),
    description: a.description.slice(0, LIMITS.chatgpt.description),
    instructions,
    conversation_starters: chatgptStarters(a, neutral),
    capabilities: { web_browsing: false, code_interpreter: false, image_generation: false },
    actions: [],
    knowledge_files: neutral.knowledge.map((k) => ({
      name: k,
      note: "Named working document. Upload your own copy if you want the GPT to read it.",
    })),
    limits: {
      name: LIMITS.chatgpt.name,
      description: LIMITS.chatgpt.description,
      instructions: LIMITS.chatgpt.instructions,
      conversation_starters: LIMITS.chatgpt.conversation_starters,
    },
    measured: {
      name: chatgptName(a).length,
      description: a.description.slice(0, LIMITS.chatgpt.description).length,
      instructions: instructions.length,
    },
    paste_ready: `${EXPORT_BASE}chatgpt/${slug}.instructions.txt`,
    notes: [
      NO_TOOLS_NOTE,
      live.length
        ? `Live connectors in the source workspace: ${live.map((c) => c.label).join(", ")}. Wire these as Actions yourself; this export does not ship credentials.`
        : "No connectors are live for this agent in the source workspace.",
      `Portable MCP endpoint: ${MCP_URL} (tools: ai_factory_list_agents, ai_factory_get_agent, ai_factory_get_export).`,
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Claude — Project instructions + a remote MCP connector              */
/* ------------------------------------------------------------------ */

function claudeInstructions(slug, a, neutral) {
  const lines = [];
  lines.push(`# ${a.name} — ${neutral.team ? neutral.team.name : "AI Agency"}`);
  lines.push("");
  lines.push(promptBody(slug, a, neutral).trimEnd());
  lines.push("");
  lines.push("## Working with the AI Factory connector");
  lines.push("");
  lines.push(
    "If the `open-connect-ai-factory` connector is enabled in this Project, you can " +
      "call `ai_factory_list_agents`, `ai_factory_get_agent` and `ai_factory_get_export` " +
      "to pull other agents' definitions. Those tools read the public roster; they do " +
      "not run any agent and they grant no credentials.",
  );
  lines.push("");
  return lines.join("\n");
}

function buildClaude(slug, a, neutral) {
  return {
    format: "claude.project/v1",
    slug,
    name: a.name,
    description: a.description,
    system_prompt: a.instruction,
    project_instructions: claudeInstructions(slug, a, neutral),
    paste_ready: `${EXPORT_BASE}claude/${slug}.instructions.md`,
    tools: [],
    mcp_servers: [
      {
        name: "open-connect-ai-factory",
        type: "http",
        transport: "streamable-http",
        url: MCP_URL,
        auth: "none",
        description:
          "Read-only access to the AI Factory roster and per-agent exports. JSON-RPC 2.0 over POST; no session, no auth.",
      },
    ],
    knowledge: neutral.knowledge,
    notes: [NO_TOOLS_NOTE],
  };
}

/* ------------------------------------------------------------------ */
/* Hermes — a real ~/.hermes/config.yaml fragment + SOUL.md            */
/* ------------------------------------------------------------------ */

/**
 * Hermes reads YAML from `~/.hermes/config.yaml` and identity from
 * `~/.hermes/SOUL.md`. A JSON document with a `hermes.agent/v1` label is not
 * something Hermes can load, so this emits the two files it actually consumes.
 */
function hermesConfigYaml(slug, a, neutral) {
  const q = (s) => JSON.stringify(s);
  const lines = [];
  lines.push("# Open-Connect AI Factory — Hermes agent config fragment");
  lines.push(`# Agent: ${a.name} (${slug})`);
  lines.push("#");
  lines.push("# Append the `mcp_servers` block to ~/.hermes/config.yaml.");
  lines.push("# Put the identity text in ~/.hermes/SOUL.md (see the .SOUL.md file).");
  lines.push("# Do not paste this whole file over an existing config.yaml — merge it.");
  lines.push("");
  lines.push("mcp_servers:");
  lines.push("  open-connect-ai-factory:");
  lines.push(`    url: ${q(MCP_URL)}`);
  lines.push("    enabled: true");
  lines.push("    timeout: 60");
  lines.push("    tools:");
  lines.push("      include:");
  lines.push("        - ai_factory_list_agents");
  lines.push("        - ai_factory_get_agent");
  lines.push("        - ai_factory_get_export");
  lines.push("");
  if (neutral.skills.length) {
    lines.push("# Skills this agent applies. Point external_dirs at a directory that");
    lines.push("# holds them, or install them with `hermes skills install`.");
    lines.push("skills:");
    lines.push("  auto_load:");
    for (const s of neutral.skills) lines.push(`    - ${q(s.id)}`);
    lines.push("");
  }
  return lines.join("\n");
}

function hermesSoul(slug, a, neutral) {
  const lines = [];
  lines.push(`# ${a.name}`);
  lines.push("");
  lines.push(`<!-- Open-Connect AI Factory agent: ${slug} -->`);
  lines.push("");
  lines.push(promptBody(slug, a, neutral).trimEnd());
  lines.push("");
  return lines.join("\n");
}

function buildHermes(slug, a, neutral) {
  return {
    format: "hermes.config/v1",
    slug,
    name: a.name,
    description: a.description,
    system_prompt: a.instruction,
    tools: [],
    skills: neutral.skills.map((s) => s.id),
    model_hint: "any instruction-following chat model",
    config_path: "~/.hermes/config.yaml",
    soul_path: "~/.hermes/SOUL.md",
    config_yaml: `${EXPORT_BASE}hermes/${slug}.config.yaml`,
    soul_md: `${EXPORT_BASE}hermes/${slug}.SOUL.md`,
    mcp_servers: [
      {
        name: "open-connect-ai-factory",
        url: MCP_URL,
        transport: "http",
        auth: "none",
      },
    ],
    notes: [NO_TOOLS_NOTE],
  };
}

/* ------------------------------------------------------------------ */
/* Generic prompt                                                      */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* Per-agent "Use in" payload                                          */
/* ------------------------------------------------------------------ */

function buildUseIn(slug, a, neutral) {
  const base = EXPORT_BASE;
  return {
    schema: "open-connect.ai-factory.use-in/v1",
    slug,
    name: a.name,
    description: a.description,
    targets: [
      {
        id: "chatgpt",
        label: "ChatGPT",
        artifact: `${base}chatgpt/${slug}.instructions.txt`,
        metadata: `${base}chatgpt/${slug}.json`,
        format: "Custom GPT (chatgpt.com → Explore GPTs → Create)",
        limits: {
          name: `${LIMITS.chatgpt.name} characters`,
          description: `${LIMITS.chatgpt.description} characters`,
          instructions: `${LIMITS.chatgpt.instructions} characters`,
          conversation_starters: `${LIMITS.chatgpt.conversation_starters} suggested prompts`,
        },
        steps: [
          "Open chatgpt.com → Explore GPTs → Create, then switch to the Configure tab.",
          `Set Name to "${chatgptName(a)}" and paste the description from the metadata file.`,
          "Paste the contents of the .instructions.txt file into Instructions.",
          "Add the four conversation starters listed in the metadata file.",
          "Upload your own copies of the knowledge documents, if you want the GPT to read them.",
          "Leave Web Browsing, Code Interpreter and Image Generation off unless you need them.",
          "Save. No Actions ship with this export — wire any connector yourself.",
        ],
        verified:
          "Structure, required fields and the 8,000-character instruction ceiling are checked at build time.",
      },
      {
        id: "claude",
        label: "Claude",
        artifact: `${base}claude/${slug}.instructions.md`,
        metadata: `${base}claude/${slug}.json`,
        format: "Claude Project + remote MCP connector",
        connector: {
          name: "open-connect-ai-factory",
          url: MCP_URL,
          transport: "streamable-http",
          auth: "none",
        },
        steps: [
          "Open claude.ai → Projects → New project.",
          "Paste the contents of the .instructions.md file into the Project's instructions.",
          "Add the connector: Customize → Connectors → + Add → Add custom connector.",
          `Name it "open-connect-ai-factory" and enter the URL ${MCP_URL}.`,
          "Choose Authentication → No sign in, then Add.",
          "Enable the connector inside the Project.",
          "On Team or Enterprise, an Owner adds it first via Organization settings → Connectors → Add → Custom → Web.",
        ],
        verified:
          "The MCP endpoint is exercised as an external client (initialize, tools/list, tools/call) by the production gate.",
      },
      {
        id: "hermes",
        label: "Hermes",
        artifact: `${base}hermes/${slug}.config.yaml`,
        metadata: `${base}hermes/${slug}.json`,
        format: "Hermes Agent (~/.hermes/config.yaml + ~/.hermes/SOUL.md)",
        steps: [
          "Install Hermes and run `hermes setup` once so ~/.hermes exists.",
          "Append the mcp_servers block from the .config.yaml file to ~/.hermes/config.yaml.",
          "Write the .SOUL.md file to ~/.hermes/SOUL.md (or merge it into your existing SOUL.md).",
          "Run `hermes chat` and ask it to list the AI Factory agents.",
        ],
        verified:
          "The YAML fragment is parsed at build time and its keys match Hermes' documented mcp_servers schema.",
      },
      {
        id: "generic",
        label: "Any other agent",
        artifact: `${base}prompt/${slug}.md`,
        metadata: `${base}neutral/${slug}.json`,
        format: "Plain system prompt, or a neutral JSON agent record",
        steps: [
          "Paste the .md file into your runtime's system prompt or instructions field.",
          "If your runtime takes a structured agent definition, load the neutral JSON instead.",
          "Supply your own knowledge files and credentials; none ship with this export.",
        ],
        verified:
          "The prompt carries the agent's instruction verbatim; the neutral record carries all seven fields.",
      },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Manifests                                                           */
/* ------------------------------------------------------------------ */

function buildIndex(entries) {
  return {
    schema: "open-connect.ai-factory.export-index/v1",
    generated_at: new Date().toISOString(),
    count: entries.length,
    formats: FORMATS,
    base: EXPORT_BASE,
    mcp_endpoint: MCP_URL,
    openapi: `${EXPORT_BASE}openapi.json`,
    use_in: `${EXPORT_BASE}use-in/`,
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
      version: "1.1.0",
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
      "/ai-factory/roster/data/exports/use-in/{slug}.json": {
        get: {
          operationId: "getUseIn",
          summary: "Per-target setup steps, limits and artifact URLs for one agent",
          parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "Use-in payload" } },
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
/* Card injection: a "Use in" control on every roster card.            */
/* ------------------------------------------------------------------ */

const USE_BLOCK_RE = /\n?<div class="pf-use"[\s\S]*?<\/div>\n?/g;

function useBlock(slug) {
  const base = `${EXPORT_BASE}`;
  const quick = [
    ["ChatGPT", `${base}chatgpt/${slug}.instructions.txt`],
    ["Claude", `${base}claude/${slug}.instructions.md`],
    ["Hermes", `${base}hermes/${slug}.config.yaml`],
    ["Prompt", `${base}prompt/${slug}.md`],
  ]
    .map(
      ([label, url]) =>
        `<a class="pf-use-link" href="${url}" download title="Download the ${label} artifact">${label}</a>`,
    )
    .join("");
  return (
    `\n    <div class="pf-use">` +
    `<span class="pf-use-key">Use in</span>` +
    `<button type="button" class="pf-use-open" data-agent="${slug}" aria-haspopup="dialog">` +
    `Set up in ChatGPT · Claude · Hermes` +
    `</button>` +
    `<span class="pf-use-links">${quick}</span>` +
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
.pf-use-open{font:500 10px/1 "JetBrains Mono",monospace;padding:5px 9px;border-radius:5px;border:1px solid rgba(15,214,206,.45);color:#0fd6ce;background:rgba(15,214,206,.10);cursor:pointer;transition:background .15s,border-color .15s}
.pf-use-open:hover,.pf-use-open:focus-visible{background:rgba(15,214,206,.20);border-color:rgba(15,214,206,.75);outline:none}
.pf-use-links{display:flex;flex-wrap:wrap;gap:4px}
.pf-use-link{font:500 10px/1 "JetBrains Mono",monospace;padding:4px 7px;border-radius:5px;border:1px solid rgba(255,255,255,.14);color:#9fb0bd;text-decoration:none;background:rgba(255,255,255,.03);transition:background .15s,border-color .15s,color .15s}
.pf-use-link:hover,.pf-use-link:focus-visible{background:rgba(15,214,206,.12);border-color:rgba(15,214,206,.5);color:#0fd6ce;outline:none}

/* Use-in dialog */
.pf-ui-scrim{position:fixed;inset:0;background:rgba(4,8,12,.72);backdrop-filter:blur(3px);z-index:1200;display:none}
.pf-ui-scrim.open{display:block}
.pf-ui{position:fixed;z-index:1201;top:50%;left:50%;transform:translate(-50%,-50%);width:min(760px,calc(100vw - 32px));max-height:min(84vh,760px);display:none;flex-direction:column;background:#0d141b;border:1px solid rgba(15,214,206,.28);border-radius:14px;box-shadow:0 24px 80px rgba(0,0,0,.6);overflow:hidden}
.pf-ui.open{display:flex}
.pf-ui-head{display:flex;align-items:flex-start;gap:12px;padding:18px 20px 14px;border-bottom:1px solid rgba(255,255,255,.08)}
.pf-ui-title{font:600 16px/1.3 "Inter",system-ui,sans-serif;color:#eaf2f7;margin:0}
.pf-ui-sub{font:400 12px/1.5 "Inter",system-ui,sans-serif;color:#8b9aa7;margin:4px 0 0}
.pf-ui-close{margin-left:auto;background:none;border:1px solid rgba(255,255,255,.16);color:#9fb0bd;border-radius:7px;width:30px;height:30px;cursor:pointer;font-size:15px;line-height:1;flex:none}
.pf-ui-close:hover,.pf-ui-close:focus-visible{border-color:rgba(15,214,206,.6);color:#0fd6ce;outline:none}
.pf-ui-tabs{display:flex;gap:4px;padding:12px 20px 0;flex-wrap:wrap}
.pf-ui-tab{font:500 12px/1 "Inter",system-ui,sans-serif;padding:8px 13px;border-radius:8px 8px 0 0;border:1px solid transparent;border-bottom:none;background:none;color:#8b9aa7;cursor:pointer}
.pf-ui-tab[aria-selected="true"]{background:rgba(15,214,206,.10);border-color:rgba(15,214,206,.30);color:#0fd6ce}
.pf-ui-tab:hover{color:#cfe0ea}
.pf-ui-body{padding:16px 20px 20px;overflow:auto}
.pf-ui-format{font:500 11px/1.5 "JetBrains Mono",monospace;color:#7c8b99;margin:0 0 12px}
.pf-ui-steps{margin:0 0 16px;padding-left:20px;color:#c3d2dd;font:400 13px/1.65 "Inter",system-ui,sans-serif}
.pf-ui-steps li{margin-bottom:7px}
.pf-ui-steps code{font:500 12px/1 "JetBrains Mono",monospace;background:rgba(255,255,255,.07);padding:2px 5px;border-radius:4px;color:#9fe8e3;word-break:break-all}
.pf-ui-limits{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 14px}
.pf-ui-limit{font:500 10px/1 "JetBrains Mono",monospace;padding:5px 8px;border-radius:5px;background:rgba(255,255,255,.05);color:#9fb0bd;border:1px solid rgba(255,255,255,.08)}
.pf-ui-actions{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}
.pf-ui-btn{font:500 12px/1 "Inter",system-ui,sans-serif;padding:9px 14px;border-radius:8px;border:1px solid rgba(15,214,206,.45);background:rgba(15,214,206,.12);color:#0fd6ce;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:6px}
.pf-ui-btn:hover,.pf-ui-btn:focus-visible{background:rgba(15,214,206,.22);outline:none}
.pf-ui-btn.ghost{border-color:rgba(255,255,255,.16);background:rgba(255,255,255,.03);color:#9fb0bd}
.pf-ui-btn.ghost:hover{color:#cfe0ea;border-color:rgba(255,255,255,.3)}
.pf-ui-verified{font:400 11px/1.6 "Inter",system-ui,sans-serif;color:#6f8290;border-top:1px solid rgba(255,255,255,.07);padding-top:12px;margin:0}
.pf-ui-err{color:#f9b73f;font:400 13px/1.6 "Inter",system-ui,sans-serif}
`;

const PORTABILITY_JS = `/* AI Factory — "Use in" setup dialog */
(function () {
  "use strict";
  var EXPORT_BASE = "/ai-factory/roster/data/exports/";
  var scrim, dialog, titleEl, subEl, tabsEl, bodyEl, cache = {};

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function build() {
    if (dialog) return;
    scrim = el("div", "pf-ui-scrim");
    dialog = el("div", "pf-ui");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", "Set up this agent in another tool");

    var head = el("div", "pf-ui-head");
    var wrap = el("div");
    titleEl = el("h2", "pf-ui-title", "");
    subEl = el("p", "pf-ui-sub", "");
    wrap.appendChild(titleEl);
    wrap.appendChild(subEl);
    var close = el("button", "pf-ui-close", "\\u00d7");
    close.type = "button";
    close.setAttribute("aria-label", "Close");
    close.addEventListener("click", hide);
    head.appendChild(wrap);
    head.appendChild(close);

    tabsEl = el("div", "pf-ui-tabs");
    tabsEl.setAttribute("role", "tablist");
    bodyEl = el("div", "pf-ui-body");

    dialog.appendChild(head);
    dialog.appendChild(tabsEl);
    dialog.appendChild(bodyEl);
    document.body.appendChild(scrim);
    document.body.appendChild(dialog);

    scrim.addEventListener("click", hide);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && dialog.classList.contains("open")) hide();
    });
  }

  function hide() {
    if (!dialog) return;
    dialog.classList.remove("open");
    scrim.classList.remove("open");
    document.body.style.overflow = "";
  }

  function copy(text, btn) {
    var done = function () {
      var prev = btn.textContent;
      btn.textContent = "Copied";
      setTimeout(function () { btn.textContent = prev; }, 1200);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () {});
    }
  }

  function renderTarget(target) {
    bodyEl.innerHTML = "";
    bodyEl.appendChild(el("p", "pf-ui-format", target.format || ""));

    if (target.limits) {
      var limits = el("div", "pf-ui-limits");
      Object.keys(target.limits).forEach(function (k) {
        limits.appendChild(el("span", "pf-ui-limit", k.replace(/_/g, " ") + ": " + target.limits[k]));
      });
      bodyEl.appendChild(limits);
    }

    var ol = el("ol", "pf-ui-steps");
    (target.steps || []).forEach(function (step) {
      var li = el("li");
      // Render inline code spans for anything wrapped in backticks.
      var parts = String(step).split(/(\`[^\`]+\`)/g);
      parts.forEach(function (p) {
        if (p.charAt(0) === "\`" && p.charAt(p.length - 1) === "\`" && p.length > 1) {
          li.appendChild(el("code", null, p.slice(1, -1)));
        } else if (p) {
          li.appendChild(document.createTextNode(p));
        }
      });
      ol.appendChild(li);
    });
    bodyEl.appendChild(ol);

    var actions = el("div", "pf-ui-actions");
    var open = el("a", "pf-ui-btn", "Open artifact");
    open.href = target.artifact;
    open.target = "_blank";
    open.rel = "noopener";
    actions.appendChild(open);

    var dl = el("a", "pf-ui-btn ghost", "Download");
    dl.href = target.artifact;
    dl.setAttribute("download", "");
    actions.appendChild(dl);

    if (target.metadata) {
      var meta = el("a", "pf-ui-btn ghost", "Metadata JSON");
      meta.href = target.metadata;
      meta.target = "_blank";
      meta.rel = "noopener";
      actions.appendChild(meta);
    }

    var copyBtn = el("button", "pf-ui-btn ghost", "Copy URL");
    copyBtn.type = "button";
    copyBtn.addEventListener("click", function () { copy(target.artifact, copyBtn); });
    actions.appendChild(copyBtn);

    bodyEl.appendChild(actions);

    if (target.verified) {
      bodyEl.appendChild(el("p", "pf-ui-verified", "Verified: " + target.verified));
    }
  }

  function selectTab(payload, id) {
    Array.prototype.forEach.call(tabsEl.children, function (btn) {
      btn.setAttribute("aria-selected", btn.getAttribute("data-target") === id ? "true" : "false");
    });
    var target = (payload.targets || []).filter(function (t) { return t.id === id; })[0];
    if (target) renderTarget(target);
  }

  function open(slug) {
    build();
    titleEl.textContent = "Loading\\u2026";
    subEl.textContent = "";
    tabsEl.innerHTML = "";
    bodyEl.innerHTML = "";
    dialog.classList.add("open");
    scrim.classList.add("open");
    document.body.style.overflow = "hidden";

    var paint = function (payload) {
      titleEl.textContent = payload.name + " \\u2014 use in another tool";
      subEl.textContent = payload.description || "";
      tabsEl.innerHTML = "";
      (payload.targets || []).forEach(function (t, i) {
        var btn = el("button", "pf-ui-tab", t.label);
        btn.type = "button";
        btn.setAttribute("role", "tab");
        btn.setAttribute("data-target", t.id);
        btn.setAttribute("aria-selected", i === 0 ? "true" : "false");
        btn.addEventListener("click", function () { selectTab(payload, t.id); });
        tabsEl.appendChild(btn);
      });
      if (payload.targets && payload.targets.length) selectTab(payload, payload.targets[0].id);
    };

    if (cache[slug]) return paint(cache[slug]);
    fetch(EXPORT_BASE + "use-in/" + slug + ".json", { headers: { accept: "application/json" } })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (payload) { cache[slug] = payload; paint(payload); })
      .catch(function (err) {
        titleEl.textContent = "Setup steps unavailable";
        bodyEl.innerHTML = "";
        bodyEl.appendChild(el("p", "pf-ui-err", "Could not load the setup steps for this agent (" + err.message + "). The export files are still available from the card."));
      });
  }

  document.addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest(".pf-use-open") : null;
    if (!btn) return;
    e.preventDefault();
    open(btn.getAttribute("data-agent"));
  });
})();
`;

/* ------------------------------------------------------------------ */

const entries = [];
const files = new Map(); // relative path -> content
const limitFailures = [];

for (const slug of Object.keys(agents).sort()) {
  const a = agents[slug];
  const neutral = buildNeutral(slug, a);

  const chatgpt = buildChatGPT(slug, a, neutral);
  const chatgptText = chatgptInstructions(slug, a, neutral);
  const claude = buildClaude(slug, a, neutral);
  const claudeText = claudeInstructions(slug, a, neutral);
  const hermes = buildHermes(slug, a, neutral);
  const hermesYaml = hermesConfigYaml(slug, a, neutral);
  const hermesSoulText = hermesSoul(slug, a, neutral);

  // Enforce each target's real ceiling at build time.
  if (chatgpt.name.length > LIMITS.chatgpt.name) {
    limitFailures.push(`${slug}: ChatGPT name ${chatgpt.name.length} > ${LIMITS.chatgpt.name}`);
  }
  if (chatgpt.description.length > LIMITS.chatgpt.description) {
    limitFailures.push(
      `${slug}: ChatGPT description ${chatgpt.description.length} > ${LIMITS.chatgpt.description}`,
    );
  }
  if (chatgptText.length > LIMITS.chatgpt.instructions) {
    limitFailures.push(
      `${slug}: ChatGPT instructions ${chatgptText.length} > ${LIMITS.chatgpt.instructions}`,
    );
  }
  if (chatgpt.conversation_starters.length > LIMITS.chatgpt.conversation_starters) {
    limitFailures.push(`${slug}: too many conversation starters`);
  }

  files.set(`neutral/${slug}.json`, JSON.stringify(neutral, null, 2) + "\n");
  files.set(`chatgpt/${slug}.json`, JSON.stringify(chatgpt, null, 2) + "\n");
  files.set(`chatgpt/${slug}.instructions.txt`, chatgptText);
  files.set(`claude/${slug}.json`, JSON.stringify(claude, null, 2) + "\n");
  files.set(`claude/${slug}.instructions.md`, claudeText);
  files.set(`hermes/${slug}.json`, JSON.stringify(hermes, null, 2) + "\n");
  files.set(`hermes/${slug}.config.yaml`, hermesYaml);
  files.set(`hermes/${slug}.SOUL.md`, hermesSoulText);
  files.set(`prompt/${slug}.md`, buildPrompt(slug, a, neutral));
  files.set(`use-in/${slug}.json`, JSON.stringify(buildUseIn(slug, a, neutral), null, 2) + "\n");

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
      chatgpt_instructions: `${EXPORT_BASE}chatgpt/${slug}.instructions.txt`,
      claude: `${EXPORT_BASE}claude/${slug}.json`,
      claude_instructions: `${EXPORT_BASE}claude/${slug}.instructions.md`,
      hermes: `${EXPORT_BASE}hermes/${slug}.json`,
      hermes_config: `${EXPORT_BASE}hermes/${slug}.config.yaml`,
      hermes_soul: `${EXPORT_BASE}hermes/${slug}.SOUL.md`,
      prompt: `${EXPORT_BASE}prompt/${slug}.md`,
      use_in: `${EXPORT_BASE}use-in/${slug}.json`,
    },
  });
}

if (limitFailures.length) {
  console.error("[ai-factory-exports] target limits exceeded:");
  for (const f of limitFailures.slice(0, 20)) console.error(`  ${f}`);
  process.exit(1);
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

// Inject the per-card "Use in" control and the dialog into every page that
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
