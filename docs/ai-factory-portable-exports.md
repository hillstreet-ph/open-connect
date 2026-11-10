# AI Factory — Portable Agent Exports

Every AI Factory agent is consumable outside open-connect. This directory
documents the export set, the MCP endpoint, and — importantly — what is *not*
real.

## What exists

| Format | Path | Shape |
|---|---|---|
| Neutral | `data/exports/neutral/<slug>.json` | Seven fields + `team`, `teams`, `niche`, `niches`, `slug`, `avatar`, `capabilities` |
| ChatGPT | `data/exports/chatgpt/<slug>.json` | `instructions`, `conversation_starters`, `actions: []`, `knowledge_files` |
| Claude | `data/exports/claude/<slug>.json` | `system_prompt`, `tools: []`, `mcp_servers[]` |
| Hermes | `data/exports/hermes/<slug>.json` | `system_prompt`, `tools: []`, `skills[]`, `model_hint` |
| Prompt | `data/exports/prompt/<slug>.md` | Front-matter + system prompt, for prompt-only runtimes |

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
python3 scripts/validate_ai_factory_roster.py         # live smoke, incl. every export URL
```

The live smoke test reads `index.json` to discover the slugs, so it needs no
hard-coded agent list and cannot drift from the data.
