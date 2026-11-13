# Open Connect — Current State Inventory

**Date:** 2026-09-18  
**Domain:** https://open-connect.site  
**Repo:** hillstreet-ph/open-connect · default branch `main`  
**Rule:** DISCOVER → INVENTORY → REUSE — do not rebuild

## Live verification

| Probe | Result |
|---|---|
| Cloudflare Pages project `open-connect-app` | Production deployment active |
| Custom domains | `open-connect.site`, `www.open-connect.site` |
| Pages production branch | `main` |
| Pages functions | Active |
| `/v1` · `/mcp` without key | 401 expected |
| Public pages | Served by Cloudflare Pages |

## Stack

| Layer | Current implementation | Target / policy | Classification |
|---|---|---|---|
| Source | GitHub `hillstreet-ph/open-connect` | Protected, reviewed release flow | **KEEP** |
| Edge and web/API runtime | Cloudflare Pages `open-connect-app`, including Pages Functions for SSR, OAuth, `/api/v1`, `/v1`, and `/mcp` | Keep public frontend and edge API surface | **KEEP** |
| Control-plane runtime | Zeabur FastAPI/control-plane services | Zeabur is the approved server runtime for backend services | **KEEP / VERIFY** |
| Data/Auth — current legacy configuration | Supabase project `gnqpwewbgldonarggzax` remains referenced by legacy fallback/configuration where not yet migrated | Preserve until cutover and rollback evidence exists | **CURRENT / MIGRATE** |
| Data/Auth — migration target | Supabase `open-platform` (`huadtiuuoiriqrjpjxhr`), schema `open_connect` | Canonical shared platform target after full validation | **TARGET / VERIFY** |
| Models | `/v1` via OpenRouter/LiteLLM-compatible aliases | Extend behind gateway controls | **KEEP** |
| Observability | Sentry connection metadata | Complete releases, traces, alerts, and source maps | **PARTIAL** |
| Containers | Application is primarily Pages/Functions; control plane has separate runtime packaging | Add images only for services that require them | **AS NEEDED** |

**Runtime boundary:** Cloudflare Pages and Pages Functions are the active public edge/web/API runtime. Zeabur is the approved runtime for separate backend and control-plane services. Railway is not approved for new deployments.

## Surfaces

**Public:** `/` `/auth` `/login` `/resources` `/integrations` `/connections` `/models` `/explore` `/mcp` `/v1/*` `/oauth/*` `/api/v1/*`  
**Authenticated:** `/dashboard` `/studio` `/orgs` `/projects` `/projects/$projectId` `/roles` `/secrets` `/api-keys` `/agents` `/toolkits` `/admin` `/settings` `/guides` `/tasks` `/schedule` `/automations`

## Identity

| Model | State |
|---|---|
| Canonical organization/project roles | Implemented; verify every privileged path server-side |
| Legacy `user_roles` | Keep until migration and compatibility tests complete |
| Development/staging/production environments | Implemented; preserve trust-zone separation |
| Machine principals | Partial |

## Migration gate

Do not relabel the migration target as the current production data plane until all runtime variables, Supabase CLI linkage, migrations, OAuth redirects, RLS tests, backups, restore checks, and rollback steps point to and pass against the same validated project.
