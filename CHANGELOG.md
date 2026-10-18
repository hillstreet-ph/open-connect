# Changelog

## Unreleased

- Deduplicated the vendored skill catalog and gave every vendored skill a real version.
  Identical content vendored from two repositories now collapses to one canonical entry (the
  higher-trust source wins) with the other recorded as an alias. The same skill name appearing in
  two directories of one repository is treated as a superseded revision, with the longer body kept
  as canonical and the older one recorded as lineage. Numeric slug suffixes are gone. Each skill
  now carries a SHA-256 content hash, a semver version (`1.0.0+<hash>` when upstream declares
  none), and the pinned upstream commit, so the catalog went from 251 rows to 249 canonical rows.
  Added `npm run skills:sync` / `skills:sync:write`, a weekly upstream drift workflow, and a
  follow-up migration (`20261006010000_vendored_skill_dedupe_renames.sql`) that re-points references
  to a duplicate before retiring it and removes vendored rows no longer in the catalog. The original
  vendoring migration is left frozen, because environments that already ran it would not re-run it.
- Fixed the marketplace publish job, which failed with `registry source upsert failed: HTTP 400`.
  Registry rows that omit `enabled` were treated as disabled, so the bulk `registry_sources` upsert
  sent rows with two different key sets and PostgREST rejected the request. Absent now means enabled,
  and every row is built with the full column set. Enabled sources now resolve to 40 (27 Firecrawl),
  up from 13.
- Vendored 251 MIT-licensed agent skills from `OpenHands/extensions`, `OpenHands/OpenHands`
  (`.agents/skills`, also served by `OpenHands/openhands`), `master-kanor/manus-skills`, and
  `openclaw/openclaw` into `skills/vendor`. The marketplace catalog, static
  `public/downloads/skills` packages, and a Supabase migration are generated from
  `config/vendored-skills.manifest.json`; every row stays metadata-only, `verified: false`, and
  review-gated.
- Added `npm run skills:generate` / `npm run skills:validate` plus `vendored-skills.test.ts`, and
  registered the four upstream repositories as marketplace and capability sources.
- Credentials now support password-manager records with email, username, website, notes, an
  encrypted password/key, and a separately encrypted optional TOTP seed. Owners can explicitly
  reveal/copy their own value or current six-digit OTP; revealed values auto-clear after 30 seconds.
- Internal Toolkit creation now selects only resources already added to the signed-in user's
  personal library; Marketplace remains the separate public resource catalog.
- Added navigation regression coverage that prevents Connections, Integrations, Credentials, and
  AI Gateway from routing into Marketplace.
- Connections now support Vault-backed API/token setup for Docker Hub, Cloudflare, Supabase,
  Sentry, Zeabur, Databricks, and other token-based providers; OAuth-capable apps such as GitHub,
  Notion, and Airtable retain their authorization-request flow.
- Added Custom MCP server setup with HTTPS endpoint validation and encrypted bearer credentials.
- AI Gateway now accepts separate OpenRouter, OpenAI, Anthropic, Gemini, xAI, Mistral, and DeepSeek
  provider keys while clients continue to use one Open-Connect `/v1` endpoint.

All notable changes to **Open-Connect** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-09-06

First production release of the Open-Connect single AI gateway on **https://open-connect.site**.

### Added

- **Single gateway** for ChatGPT, Claude, Grok, Open WebUI, Hermes, Mistral, Cursor
- OpenAI-compatible **`/v1`** models (LiteLLM / OpenRouter) and **`/mcp`** MCP server
- **OAuth** PKCE S256 (`.well-known/oauth-authorization-server`)
- Marketplace catalog: skills, apps, MCP, agents, prompts, plugins, tools, models
- Studio: create/upload packages with **bulk auto-detect** (zip / markdown)
- Connections: Pipedream, Composio, 1Password, Telegram, and more
- Autonomy skills: MultiOn, Cloudflare browser (CDP), agent-browser terminal
- Workspace ops: organizations, projects, tasks, schedule, automations
- Roles & access capability matrix; scoped `oc_live_` API keys
- Stack: GitHub + Cloudflare Pages + Supabase (no Vercel)

### Infrastructure

- Domain: `open-connect.site`
- Cloudflare Pages project: `open-connect-app` · KV `OC_KV`
- Supabase project: `open-connect` (`gnqpwewbgldonarggzax`)

### Links

- Site: https://open-connect.site
- Integrations: https://open-connect.site/integrations
- Source: https://github.com/hillstreet-ph/open-connect

[1.0.0]: https://github.com/hillstreet-ph/open-connect/releases/tag/v1.0.0
