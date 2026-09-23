# Changelog

## Unreleased

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
