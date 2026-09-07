# Open Connect — Current State Inventory

**Date:** 2026-09-07  
**Domain:** https://open-connect.site  
**Repo:** hillstreet-ph/open-connect · default branch `main`  
**Version:** 1.0.0 (`package.json` / `VERSION`)  
**Rule:** DISCOVER → INVENTORY → REUSE — do not rebuild

## Live verification

| Probe | Result |
|-------|--------|
| `GET /api/v1/health` | `status: ok` |
| `model_upstream` | `openrouter` |
| `LITELLM_MASTER_KEY` / OpenRouter | bound |
| `OC_KV` | bound + writable |
| `SUPABASE_SERVICE_ROLE_KEY` | **false** (Pages) |
| `/v1` · `/mcp` without key | 401 (expected) |
| Public pages `/` `/resources` `/models` | 200 |

## Stack

| Layer | Implementation | Classification |
|-------|----------------|----------------|
| Source | GitHub hillstreet-ph/open-connect | **KEEP** |
| Edge | Cloudflare Pages `open-connect-app` + domain open-connect.site | **KEEP** |
| Data/Auth | Supabase `gnqpwewbgldonarggzax` | **KEEP** |
| Models | `/v1` → OpenRouter (LiteLLM-compatible aliases) | **KEEP** / extend |
| Optional runtime | Zeabur (metadata connections only) | **KEEP** optional |
| Observability | Sentry connection metadata | **PARTIAL** |
| Containers | No Dockerfile on app | **CREATE** only if worker image needed |

**Not** production edge: Vercel, Railway (preview only if approved).

## Surfaces (routes)

**Public:** `/` `/auth` `/login` `/resources` `/integrations` `/connections` `/models` `/explore` `/mcp` `/v1/*` `/oauth/*` `/api/v1/*`  
**Authenticated:** `/dashboard` `/studio` `/orgs` `/projects` `/projects/$projectId` `/roles` `/secrets` `/api-keys` `/agents` `/toolkits` `/admin` `/settings` `/guides` `/tasks` `/schedule` `/automations`

## Domain modules

`orgs.functions` · `workspace.functions` · `resources.functions` · `toolkits.functions` · `connections.functions` · `api-keys.functions` · `secrets.functions` · `agents.functions` · `roles.functions` · `rbac` · `identity` · `oauth.server` · `gateway.server` · `ops.functions` · `kv.server`

## Identity (dual)

| Model | State |
|-------|--------|
| Canonical: Org Owner/Admin/Member + Project Manager/Developer/Viewer | **IMPLEMENTED** (tables, seed, nav, docs) |
| Legacy: user_roles user/developer/publisher/admin/owner | **KEEP** until migration complete |
| Environments Dev/Staging/Prod | **IMPLEMENTED** seed + project UI |
| Machine principals | **PARTIAL** |

## Data (known)

organizations · organization_members · projects · project_members · environments · project_resources · project_connections · resources · categories · toolkits · app_connections · agent_vault · api_keys · profiles · user_roles · tasks · schedules · automations · principals (partial)

## Product boundary

Open Connect = gateway + marketplace + connections + vault/broker + models + MCP/API.  
Open Box / TGate / Teleset / Hub / System / Omni-Agents / KobePlay = **consumers**, not absorbed.
