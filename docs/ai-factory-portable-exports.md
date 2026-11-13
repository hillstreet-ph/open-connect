# AI Factory — Portable Agent Exports

Every AI Factory agent is consumable outside open-connect. This directory
documents the export set, the MCP endpoint, and — importantly — what is *not*
real.

## What exists

Every target gets the artifact **its own UI accepts**, not just a JSON blob it
cannot consume. A JSON document labelled `hermes` is not something Hermes can
load; the export set therefore also ships the files each tool actually reads.

| Format | Artifacts | Shape |
|---|---|---|
| Neutral | `neutral/<slug>.json` | Seven fields + `team`, `teams`, `niche`, `niches`, `slug`, `avatar`, `capabilities` |
| ChatGPT | `chatgpt/<slug>.json` + `chatgpt/<slug>.instructions.txt` | Custom-GPT metadata (name ≤ 50, description ≤ 300, ≤ 4 starters) and the exact text to paste into Instructions (≤ 8,000 chars) |
| Claude | `claude/<slug>.json` + `claude/<slug>.instructions.md` | Project instructions plus an `mcp_servers` block naming the remote connector URL and transport |
| Hermes | `hermes/<slug>.json` + `hermes/<slug>.config.yaml` + `hermes/<slug>.SOUL.md` | A real `~/.hermes/config.yaml` fragment (`mcp_servers` + `skills.auto_load`) and the `~/.hermes/SOUL.md` identity file |
| Prompt | `prompt/<slug>.md` | Front-matter + system prompt, for prompt-only runtimes |
| Use in | `use-in/<slug>.json` | Per-target format, limits, numbered steps, artifact + metadata URLs |

Plus:

- `data/exports/index.json` — manifest of all 103 agents and their five URLs each
- `data/exports/openapi.json` — OpenAPI 3.1 description of the static export paths
- `data/exports/mcp/manifest.json` — the MCP server manifest

All of it is generated at build time by
`scripts/generate-ai-factory-exports.mjs`, which runs from `prebuild` after the
roster zip is unpacked. Nothing here is hand-maintained, so it cannot drift from
`data/agents-v10.json`.

## The MCP endpoint

```
POST https://open-connect.site/ai-factory/mcp
Content-Type: application/json
```

JSON-RPC 2.0, stateless, no auth. Tools:

| Tool | Purpose |
|---|---|
| `ai_factory_list_agents` | All 103 agents: slug, name, description, team, niche, live-connector count |
| `ai_factory_get_agent` | One agent's neutral seven-field export |
| `ai_factory_get_export` | One agent's export in `neutral` / `chatgpt` / `claude` / `hermes` / `prompt` |

A `GET` on the same URL returns the manifest, so a human can see what the
endpoint offers without speaking JSON-RPC.

### Client config

Claude Desktop / Claude Code (`claude_desktop_config.json` or `.mcp.json`):

```json
{
  "mcpServers": {
    "open-connect-ai-factory": {
      "type": "http",
      "url": "https://open-connect.site/ai-factory/mcp"
    }
  }
}
```

Any MCP client that speaks streamable HTTP can use the same URL.

## Honest limits

These are deliberate, and the exports state them rather than papering over them:

1. **No agent execution.** The endpoint serves definitions. There is no agent
   runtime behind it, so no tool here runs an agent. Pulling an agent into
   ChatGPT or Claude means *you* run it there.
2. **No callable tools in any export.** An agent's `tools` field in the source
   data holds internal capability ids, not function definitions, and most of its
   connectors are `available` or `planned` rather than `live`. So every
   `chatgpt` / `claude` / `hermes` export ships `tools: []` and says why.
   Emitting a tool definition would claim a capability the agent does not have.
3. **No credentials.** Connector status is reported, never granted. Wiring a
   live connector into your own runtime is your authorization to make.
4. **Static data.** The export set is built from `agents-v10.json` at deploy
   time. It is not a live query against the workspace database, so a change made
   in the app appears here only after the next build.

## Verifying

```bash
node scripts/generate-ai-factory-exports.mjs          # regenerate
node scripts/generate-ai-factory-exports.mjs --check  # fail if stale
python3 scripts/validate_ai_factory_exports_test.py   # offline contract (2077 checks)
python3 scripts/validate_ai_factory_exports.py        # per-target limits, YAML schema, secret scan
python3 scripts/validate_ai_factory_roster.py         # live smoke, incl. every export URL
```

The live smoke test reads `index.json` to discover the slugs, so it needs no
hard-coded agent list and cannot drift from the data.

## On the platform

Every agent card carries a **Use in** control: a *Set up in ChatGPT · Claude ·
Hermes* button that opens a dialog with the four targets, their limits, the
numbered steps for that tool, and links to the artifact and its metadata JSON
(`assets/portability.js`, `assets/portability.css`). The four quick-download
chips beside it go straight to the ChatGPT instructions, Claude instructions,
Hermes config and generic prompt.

The dialog is driven by `use-in/<slug>.json`, so the steps a user reads and the
files they download come from the same generated source as the exports
themselves. There is no second, hand-written copy of the instructions to drift.

## What each target still needs from a human

These are the steps no export can perform, stated plainly so nobody expects the
download alone to be a finished integration:

| Target | Human step |
|---|---|
| ChatGPT | Create the GPT and paste the file; add Actions yourself if you want connector access — no credentials ship |
| Claude | Add the custom connector in your account (Owner on Team/Enterprise), then enable it in the Project |
| Hermes | Install Hermes, merge the YAML fragment rather than overwriting `config.yaml`, write `SOUL.md` |
| Generic | Provide the model, the knowledge files and any credentials yourself |