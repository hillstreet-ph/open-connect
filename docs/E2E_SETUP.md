# Open-Connect — Professional E2E setup (production)

**Status:** LIVE · production-ready  
**Profile:** GitHub + Cloudflare + Supabase only (**no Vercel**)  
**Domain:** https://open-connect.site  
**Source:** https://github.com/hillstreet-ph/open-connect (`main`)  
**Updated:** 2026-09-06

---

## 1. Architecture

```text
GitHub  hillstreet-ph/open-connect (main)
   │
   ├─► Cloudflare Pages  open-connect-app
   │      domain: open-connect.site · www.open-connect.site
   │      KV: OC_KV (open-connect-kv)
   │      build: bun install --frozen-lockfile && bun run build → dist
   │
   └─► Supabase  open-connect (gnqpwewbgldonarggzax · ap-northeast-1)
          Auth · Postgres/RLS · Storage · Edge Functions · Vault
          Upstream models: LiteLLM / OpenRouter via /v1
```

---

## 2. Public vs workspace

| Zone | Audience | Chrome |
|------|----------|--------|
| **Public marketing** | Anyone | Site header + footer |
| **Workspace ops** | Signed-in clients | Left sidebar + top bar (Claude Design mockup) |

**Public:** `/` `/resources` `/connections` `/models` `/integrations` `/auth`  
**Workspace (login):** `/dashboard` `/studio` `/orgs` `/roles` `/guides` `/api-keys` `/agents` `/secrets` `/settings` `/toolkits` `/admin`  
**Downloads gated:** marketplace packages require login; static demos under `/downloads/`

---

## 3. Live surfaces (validated)

| Surface | URL | Status |
|---------|-----|--------|
| Health | `/api/v1/health` | ok · OC_KV bound · OpenRouter |
| Marketplace | `/resources` | 200 · login to download |
| Studio | `/studio` | 200 · auth shell |
| Organizations | `/orgs` | 200 |
| Roles & access | `/roles` | 200 · capability matrix |
| Guides | `/guides` | Professional E2E |
| MCP | `/mcp` | 401 without key |
| Models | `/v1` | 401 without key · OpenAI-compatible |
| OAuth metadata | `/.well-known/oauth-authorization-server` | PKCE **S256** · full scopes |
| Control-plane demo | `/downloads/open-connect-control-plane-demo/` | Static |
| Browser skills | `/downloads/skills/multion-autonomous/` | Static |
| Edge health | Supabase `functions/v1/health` | ok |

---

## 4. Autonomous API key scopes (auto-granted)

New `oc_live_` keys include:

```text
openid
mcp:connect
resources:read · resources:write
connections:read · connections:invoke
models:read · models:invoke
tools:invoke · secrets:read · agents:invoke
```

Connect any client without manual scope picking.

---

## 5. Integrations catalog

**AI clients:** Grok · ChatGPT · Claude · Open WebUI · Hermes · LobeHub · MultiOn · LiteLLM · OpenRouter  
**Automation:** Pipedream · Composio · Slimtools  
**Security:** 1Password  
**Infra:** Cloudflare · Supabase · GitHub · Slack · Discord · Notion · …

Marketplace published mix (skills, apps, MCP, agents, prompts, tools, plugins, models).

---

## 6. Client wiring

### Open WebUI / LobeHub

```bash
OPENAI_API_BASE=https://open-connect.site/v1
OPENAI_API_KEY=oc_live_YOUR_KEY
```

### MCP (Grok / Claude / ChatGPT / Cursor)

```json
{
  "mcpServers": {
    "open-connect": {
      "url": "https://open-connect.site/mcp",
      "headers": { "Authorization": "Bearer oc_live_YOUR_KEY" }
    }
  }
}
```

### OAuth plugins

Discover: `https://open-connect.site/.well-known/oauth-authorization-server`  
PKCE method: **S256** only

---

## 7. Roles (RBAC)

```text
user → developer → publisher → admin → owner
```

Matrix UI: **Workspace → Roles & access** (`/roles`)  
Capabilities: dashboard, studio, download/upload, keys, connections, secrets, toolkits, publish, verify, admin

---

## 8. Supabase backend

| Layer | Contents |
|-------|----------|
| Auth | Email + OAuth providers (dashboard) |
| Data | profiles, user_roles, resources, api_keys, app_connections, organizations, projects, agent_vault, … |
| Storage | avatars, resource-assets, resource-packages, user-uploads, mcp-artifacts |
| Edge | health · get_secret · add_secret · connection-webhook |
| Jobs | pg_cron maintenance · pgmq queues |

---

## 9. Cloudflare

| Item | Value |
|------|--------|
| Pages project | `open-connect-app` |
| Branch | `main` |
| KV | `OC_KV` → `open-connect-kv` |
| Build | `bun install --frozen-lockfile && bun run build` |
| Output | `dist` |
| Env | SUPABASE_* · LITELLM_* · secrets in Pages dashboard |

---

## 10. Professional operator checklist

1. Sign in at https://open-connect.site/auth  
2. Open **Hub** (`/dashboard`) — ops sidebar  
3. Create **API key** (`/api-keys`) — full scopes automatic  
4. Connect apps (`/connections`) — Pipedream, Composio, etc.  
5. Point Open WebUI / Grok / Claude at `/v1` and `/mcp`  
6. Review **Roles & access** (`/roles`)  
7. Run **Professional setup** guides (`/guides`) + control-plane demo under `/downloads/`

---

## 11. Verify commands

```bash
curl -sS https://open-connect.site/api/v1/health
curl -sS https://gnqpwewbgldonarggzax.supabase.co/functions/v1/health
curl -sS https://open-connect.site/.well-known/oauth-authorization-server | head
curl -sS -o /dev/null -w "%{http_code}\n" https://open-connect.site/roles
curl -sS -o /dev/null -w "%{http_code}\n" https://open-connect.site/mcp
```

---

**Open-Connect is production-ready for all-in-one AI agents, skills, plugins, MCP, connections, credentials, and client integrations on open-connect.site.**
