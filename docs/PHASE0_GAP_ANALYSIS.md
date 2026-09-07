# Phase 0 — Discovery & Gap Analysis

**Product:** Open Connect  
**Domain:** https://open-connect.site  
**Canonical repo:** hillstreet-ph/open-connect  
**Organization:** HillStreet  
**Date:** 2026-09-07  
**Blueprint:** Production Development & Deployment Blueprint (P0)  
**Rule:** Inspect before create · reuse → repair → extend → migrate

---

## 1. Mission alignment

Open Connect is the **shared capability plane** (gateway + marketplace + connections + vault/broker + models + MCP/API + access control).  
It does **not** own application logic for Open Box, Open TGate, Open System, Open Hub, Open Teleset, Omni-Agents, or KobePlay — those are **consumers**.

Current live product already acts as a single gateway for AI clients; blueprint expands it into a full control plane with stronger isolation, principals, vault broker, and verification gates.

---

## 2. Current architecture inventory

### 2.1 Stack (as deployed)

| Layer | Current | Blueprint target |
|-------|---------|------------------|
| Source | GitHub `hillstreet-ph/open-connect` | Same |
| Edge | Cloudflare Pages `open-connect-app` + KV `OC_KV` | CF DNS/TLS/CDN/WAF + edge |
| Data/Auth | Supabase `gnqpwewbgldonarggzax` (ap-northeast-1) | Same + migrations as code |
| Models | LiteLLM / OpenRouter via `/v1` | AI Gateway + virtual models |
| Runtime | Cloudflare Pages (no separate app runtime) | Blueprint also lists Zeabur + Docker images |
| Observability | Partial (error helpers) | Sentry releases/traces |

**Policy note:** Product owner previously constrained stack to **GitHub + Cloudflare + Supabase only** (no Vercel). Blueprint adds Docker, Zeabur, Sentry. Treat those as **P1/P0-optional** until explicitly approved; do not create duplicate deploy targets without a decision.

### 2.2 Live surfaces (verified 2026-09-07)

| Surface | Status |
|---------|--------|
| `GET /api/v1/health` | `ok` · MCP/models/api/oauth · KV bound · OpenRouter |
| `/mcp` · `/v1` | `401` without key (expected) |
| Marketing + marketplace | `/` `/resources` `/integrations` `/connections` `/models` |
| Workspace | `/dashboard` `/projects` `/orgs` `/studio` `/roles` `/secrets` `/api-keys` |
| Ops | `/tasks` `/schedule` `/automations` |
| OAuth | `/oauth/authorize` `/token` `/register` + well-known |
| Release | Tag **`v1.0.0`** · GitHub Release · `VERSION` / `CHANGELOG` |

### 2.3 Database tables (public)

```
organizations, organization_members, projects
project_resources, project_connections
resources, categories, resource_embeddings
toolkits, toolkit_items
app_connections, agent_connections, agent_vault
api_keys, profiles, user_roles
tasks, schedules, automations
gateway_requests, system_jobs, oc_backups, _oc_deploy_probe
```

**Published catalog counts:** app 17 · skill 16 · mcp 6 · prompt 4 · agent 4 · plugin 3 · tool 3 · model 3

### 2.4 Application routes (src)

**Public:** `/` `/auth` `/login` `/resources` `/integrations` `/connections` `/models` `/explore` `/mcp` `/v1/*` `/oauth/*` `/api/v1/*`  
**Authenticated:** `/dashboard` `/studio` `/orgs` `/projects` `/projects/$projectId` `/roles` `/secrets` `/api-keys` `/agents` `/toolkits` `/admin` `/settings` `/guides` `/tasks` `/schedule` `/automations`

### 2.5 Lib / domain modules

`orgs.functions` · `workspace.functions` · `resources.functions` · `resource-detect` · `toolkits.functions` · `connections.functions` · `api-keys.functions` · `secrets.functions` · `agents.functions` · `roles.functions` · `rbac` · `oauth.server` · `gateway.server` · `ops.functions` · `kv.server`

### 2.6 Related HillStreet repos (do not merge into Open Connect)

| Repo | Role |
|------|------|
| `open-connect` | Canonical control plane (this product) |
| `v1-open-connect` | Legacy Python surface — migrate useful pieces only |
| `open-custom-skills` | Skill packages consumer/source |
| `open-kobeplay` | Business workspace product (consumer) |
| `openlist-railway` / `open-template` | Adjacent infrastructure templates |
| PDF projects: open-box, open-teleset, open-tgate, open-hub, open-system, Omni-Agents | Independent products |

---

## 3. Auth / RBAC assessment

| Capability | Current | Gap |
|------------|---------|-----|
| Human auth | Supabase Auth + PKCE OAuth for clients | OK foundation |
| Org membership | `organization_members` | No workspaces table |
| Roles UI | `/roles` capability matrix · `user_roles` · `rbac.ts` | Not full deny-by-default scope engine |
| OWNER/ADMIN/USER | Partially modeled in UI/matrix | Not enforced as blueprint hierarchy everywhere |
| Machine principals | API keys `oc_live_*` with scopes | No `principals` table · no ai_client/agent/service_account types |
| Project isolation | `project_resources` · `project_connections` · optional `project_id` on keys/connections | No environments (dev/staging/prod) |
| RLS | Present on key tables | Needs explicit test suite for cross-tenant denial |

---

## 4. Domain assessment vs blueprint

| Domain | Current state | Target | Status |
|--------|---------------|--------|--------|
| Resource registry | `resources` + types + packages + detect | Full types, versions, lifecycle, manifests | **DISCOVERED / PARTIAL** |
| Marketplace | Browse, filter type, view/download, add-to-project | Categories, installed library, favorites, verified filters | **PARTIAL** |
| Toolkits | tables + `/toolkits` | Install flow: project → env → principal → grants | **PARTIAL** |
| Connections | `app_connections` capability grants | Provider → App → Connection → credential ref | **PARTIAL** |
| Vault / broker | `agent_vault` · secrets UI | Metadata + encrypted value + broker (no secret to agents) | **GAP** |
| API keys | create/list/revoke · scopes | Project/env binding · rotate · rate limits · audit | **PARTIAL** |
| MCP gateway | `/mcp` scoped by key | Dynamic tool discovery by principal+project+policy | **PARTIAL** |
| Model gateway | `/v1` OpenRouter/LiteLLM | Virtual models · routing · budgets | **PARTIAL** |
| AI client registry | Integrations page profiles | First-class principals with toolkits/scopes | **GAP** |
| Files | Storage bucket packages | Unified files domain + signed URLs | **PARTIAL** |
| Compute | MultiOn / CF browser / agent-browser skills | Policy-bound browser/terminal/sandbox jobs | **P1** |
| Audit / approvals | Minimal | audit_events · high-risk approvals | **GAP** |
| CI/CD | Pages deploy · release workflow | Full lint/type/test/secret-scan · staging gate | **PARTIAL** |
| Observability | health + helpers | Sentry + structured logs | **GAP** (stack decision) |

---

## 5. Security risks (priority)

1. **Credential spreadsheet as temporary source of truth** — migrate to Vault references; never commit sheet secrets.  
2. **Incomplete environment isolation** — risk of resolving prod secrets from non-prod principals.  
3. **Scope enforcement uneven** — frontend role matrix must not be the only gate.  
4. **Service-role usage** — keep out of client bundles (health already shows server-side env only).  
5. **MCP/API over-grant** — expand deny-by-default dynamic tool lists.  
6. **RLS test coverage** — no automated cross-tenant proof yet.  
7. **Placeholder history** — prior accidental placeholder pushes fixed; protect routeTree/resources in CI.

---

## 6. Blockers / decisions needed

| ID | Blocker | Impact |
|----|---------|--------|
| B1 | Stack: GH+CF+SB only vs blueprint Docker/Zeabur/Sentry | Deploy topology |
| B2 | Vault backend choice (Supabase Vault vs external) | Credential broker design |
| B3 | Canonical project seeds (General, Open Connect, Open Box, …) as **scopes**, not repos | Org setup |
| B4 | Production secret inventory must use references only | Ops |
| B5 | Related product repos not all present under hillstreet-ph | Naming only — do not block OC |

---

## 7. Migration plan (reuse first)

1. **Keep** Pages + Supabase + existing routes/tables.  
2. **Extend** identity: workspaces (optional), environments, principals.  
3. **Harden** RBAC: scopes + policies + RLS tests.  
4. **Normalize** resource manifests + versions (non-destructive).  
5. **Separate** Marketplace (discover) vs Library (installed).  
6. **Vault/broker** on top of `agent_vault` / secrets — broker resolves; APIs never return plaintext.  
7. **API/MCP** dynamic authorization.  
8. **Audit** table + writers on sensitive ops.  
9. **CI** quality gates before calling production ready.  
10. **Docs** under `docs/` must match implemented reality.

---

## 8. Implementation sequence (P0 phases)

| Phase | Focus | Status |
|-------|-------|--------|
| 0 | Discovery (this doc) | **PRODUCTION VERIFIED inventory** |
| 1 | DB foundation · identity · projects · environments · principals | NOT STARTED |
| 2 | RBAC · scopes · policies · RLS tests | PARTIAL |
| 3 | Resource registry · versions · files | PARTIAL |
| 4 | Marketplace · toolkits · upload/export | PARTIAL |
| 5 | Connections · OAuth · MCP integrations | PARTIAL |
| 6 | Vault metadata · broker | GAP |
| 7 | API keys · API gateway | PARTIAL |
| 8 | MCP clients · dynamic tools | PARTIAL |
| 9 | AI gateway routing · usage | PARTIAL |
| 10 | AI client registry | GAP |
| 11 | Audit · approvals · rate limits | GAP |
| 12 | CI/CD · staging · backups | PARTIAL |
| 13 | E2E · docs · release | PARTIAL (v1.0.0 tagged; blueprint DoD not fully met) |

**P1 (after P0 stable):** advanced Pipedream/Composio, compute plane, publisher workflows, budgets.

---

## 9. Definition of Done reminder

Do **not** mark production complete until blueprint §51–§52 gates pass (Owner/Admin/User + AI agent E2E, broker without secret leakage, RLS, audit, revoke, health).  
`v1.0.0` is a **foundation release**, not full P0 DoD.

---

## 10. Next action

Execute **Phase 1** on feature branch `feat/control-plane-foundation`:

- environments table + project binding  
- principals model (human + machine)  
- seed organization projects as **capability scopes**: General, Open Connect, Open Box, Open TGate, Open System, Omni-Agents, Open Hub, Open Teleset, KobePlay  
- no duplicate Cloudflare/Supabase resources  
- no secrets in git  
