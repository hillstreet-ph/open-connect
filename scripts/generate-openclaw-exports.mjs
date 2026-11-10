#!/usr/bin/env node
/**
 * Generates portable, machine-readable exports for the OpenClaw marketplace
 * resources (config/openclaw-install-requests.registry.json).
 *
 * The registry is consumable only inside this repository. Nothing about it can
 * be taken into ChatGPT, Claude, Mistral, Hermes or another agent runtime.
 * This script closes that gap by emitting, for all cataloged resources:
 *
 *   public/openclaw/exports/registry.json   verbatim registry copy
 *   public/openclaw/exports/universal.json  neutral portable catalog
 *   public/openclaw/exports/chatgpt.json    custom-GPT-ready instructions + catalog
 *   public/openclaw/exports/claude.json     Claude-ready skill catalog
 *   public/openclaw/exports/mistral.json    Mistral / Le Chat agents-ready catalog
 *   public/openclaw/exports/hermes.json     Hermes runtime agent config
 *   public/openclaw/exports/prompt.md       human-readable install pack
 *   public/openclaw/exports/index.json      manifest with download URLs
 *
 * POLICY (must stay intact): exports are metadata-only. They carry the
 * install command and canonical URL as text so the operator can run them in
 * their own environment after license verification and security review. No
 * export executes, schedules, or automates an install, and no credentials are
 * shipped. Every entry keeps its registry state (review_required).
 *
 * Usage:
 *   node scripts/generate-openclaw-exports.mjs
 *   node scripts/generate-openclaw-exports.mjs --verify-build
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const registryPath = join(root, "config", "openclaw-install-requests.registry.json");
const exportsDir = join(root, "public", "openclaw", "exports");
const VERIFY_BUILD = process.argv.includes("--verify-build");

const SITE = "https://open-connect.site";
const EXPORT_BASE = `${SITE}/openclaw/exports/`;

const registry = JSON.parse(readFileSync(registryPath, "utf8"));
const packages = registry.packages || [];
const publishers = registry.publisher_requests || [];

/* ------------------------------ validation ------------------------------ */

const errors = [];
const slugs = new Set();
for (const p of packages) {
  if (!p.slug || !p.slug.startsWith("open-oc-")) errors.push(`bad slug: ${p.slug}`);
  if (slugs.has(p.slug)) errors.push(`duplicate slug: ${p.slug}`);
  slugs.add(p.slug);
  if (p.state !== "review_required") errors.push(`unexpected state on ${p.slug}: ${p.state}`);
  if (p.canonical_url && !p.canonical_url.startsWith("https://")) {
    errors.push(`non-https canonical_url on ${p.slug}`);
  }
  if (!p.install_command && p.kind) errors.push(`missing install_command on ${p.slug}`);
}
if (registry.policy && registry.policy.mode !== "metadata_only") {
  errors.push("policy.mode must remain metadata_only");
}
if (errors.length) {
  for (const e of errors) console.error(`[openclaw-exports] ${e}`);
  process.exit(1);
}

/* ------------------------------- builders ------------------------------- */

function portableEntry(p) {
  return {
    slug: p.slug,
    kind: p.kind,
    install_command: p.install_command || null,
    source_ref: p.source_ref,
    source_type: p.source_type,
    canonical_url: p.canonical_url,
    risk: p.risk,
    state: p.state,
    review_reason: p.review_reason,
  };
}

const catalog = packages.map(portableEntry);

const POLICY_NOTE =
  "Metadata-only catalog. Install commands are provided as text for the " +
  "operator to run in their own environment after license verification and a " +
  "separate security review. Nothing here executes, downloads, or auto-installs " +
  "a package, and no credentials are included.";

function buildUniversal() {
  return {
    schema: "open-connect.marketplace.resource/v1",
    generated_at: new Date().toISOString(),
    registry_id: registry.registry_id,
    source: `${SITE}/openclaw/exports/registry.json`,
    count: catalog.length,
    publisher_requests: publishers.map((x) => ({
      source_ref: x.source_ref,
      canonical_url: x.canonical_url,
      state: x.state,
      review_reason: x.review_reason,
    })),
    policy: POLICY_NOTE,
    resources: catalog,
  };
}

function buildRuntime(format, runtimeName, extra) {
  return {
    format,
    name: `Open-Connect Marketplace (${runtimeName})`,
    description:
      `Portable export of ${catalog.length} OpenClaw marketplace resources ` +
      `(plugins and skills) cataloged by Open-Connect.`,
    generated_at: new Date().toISOString(),
    source: EXPORT_BASE + "index.json",
    policy: POLICY_NOTE,
    instructions: [
      `You are a marketplace assistant for Open-Connect. The catalog below lists ${catalog.length} resources.`,
      "For any resource the user asks about, show its slug, kind, risk, state, and install_command.",
      "Never claim to install anything yourself. Always tell the user to run the install command in their own terminal, and to complete license verification and a security review first (state is review_required until then).",
      "If the user asks for the upstream project, share the canonical_url when present.",
      "Treat critical-risk entries (browser, desktop, billing, autonomy) as requiring isolation review before the user installs them.",
    ].join(" "),
    catalog,
    ...extra,
  };
}

function buildPrompt() {
  const lines = [];
  lines.push("# Open-Connect Marketplace install pack");
  lines.push("");
  lines.push(
    `Portable export of ${catalog.length} OpenClaw marketplace resources ` +
      "(plugins and skills). Generated from the Open-Connect marketplace registry.",
  );
  lines.push("");
  lines.push("> Policy: metadata-only. Run each install command in your own");
  lines.push("> environment only after license verification and a separate");
  lines.push("> security review. Every entry is review_required until then.");
  lines.push("");
  for (const p of catalog) {
    lines.push(`## ${p.slug}`);
    lines.push("");
    lines.push(`- Kind: ${p.kind}`);
    lines.push(`- Risk: ${p.risk}`);
    lines.push(`- State: ${p.state}`);
    lines.push(`- Source: ${p.source_ref} (${p.source_type})`);
    if (p.canonical_url) lines.push(`- Upstream: ${p.canonical_url}`);
    lines.push(`- Install: \`${p.install_command}\``);
    lines.push(`- Review: ${p.review_reason}`);
    lines.push("");
  }
  if (publishers.length) {
    lines.push("## Publisher requests (no package selected yet)");
    lines.push("");
    for (const x of publishers) {
      lines.push(`- ${x.source_ref} (${x.canonical_url}) — ${x.state}: ${x.review_reason}`);
    }
    lines.push("");
  }
  return lines.join("\n") + "\n";
}

function buildIndex() {
  return {
    schema: "open-connect.marketplace.export-index/v1",
    generated_at: new Date().toISOString(),
    count: catalog.length,
    formats: ["registry", "universal", "chatgpt", "claude", "mistral", "hermes", "prompt"],
    base: EXPORT_BASE,
    downloads: {
      registry: EXPORT_BASE + "registry.json",
      universal: EXPORT_BASE + "universal.json",
      chatgpt: EXPORT_BASE + "chatgpt.json",
      claude: EXPORT_BASE + "claude.json",
      mistral: EXPORT_BASE + "mistral.json",
      hermes: EXPORT_BASE + "hermes.json",
      prompt: EXPORT_BASE + "prompt.md",
    },
    policy: POLICY_NOTE,
  };
}

/* -------------------------------- write --------------------------------- */

const files = new Map();
files.set("registry.json", JSON.stringify(registry, null, 2) + "\n");
files.set("universal.json", JSON.stringify(buildUniversal(), null, 2) + "\n");
files.set("chatgpt.json", JSON.stringify(buildRuntime("chatgpt.custom-gpt/v1", "ChatGPT custom GPT"), null, 2) + "\n");
files.set("claude.json", JSON.stringify(buildRuntime("claude.skills/v1", "Claude"), null, 2) + "\n");
files.set("mistral.json", JSON.stringify(buildRuntime("mistral.le-chat-agents/v1", "Mistral / Le Chat agents"), null, 2) + "\n");
files.set("hermes.json", JSON.stringify(buildRuntime("hermes.agent/v1", "Hermes agent runtime"), null, 2) + "\n");
files.set("prompt.md", buildPrompt());
files.set("index.json", JSON.stringify(buildIndex(), null, 2) + "\n");

rmSync(exportsDir, { recursive: true, force: true });
for (const [rel, content] of files) {
  const p = join(exportsDir, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
}

if (VERIFY_BUILD) {
  const built = join(root, ".output", "public", "openclaw", "exports");
  let bad = 0;
  for (const rel of ["index.json", "universal.json", "chatgpt.json", "claude.json", "mistral.json", "hermes.json", "prompt.md", "registry.json"]) {
    const p = join(built, rel);
    if (!existsSync(p)) {
      console.error(`[openclaw-exports] missing from build output: ${rel}`);
      bad++;
      continue;
    }
    if (rel !== "index.json" && rel !== "universal.json") {
      // generated_at differs by design; compare the non-index, non-universal docs verbatim.
      if (readFileSync(p, "utf8") !== files.get(rel)) {
        console.error(`[openclaw-exports] stale in build output: ${rel}`);
        bad++;
      }
    }
  }
  if (bad) process.exit(1);
}

console.log(
  `[openclaw-exports] ${catalog.length} resources x ${files.size} export files ` +
    `written to public/openclaw/exports`,
);
