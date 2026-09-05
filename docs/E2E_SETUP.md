# Open-Connect — Full E2E setup

**Profile:** GitHub + Cloudflare + Supabase only (no Vercel)  
**Domain:** https://open-connect.site  
**Updated:** 2026-09-05

## Architecture

```text
GitHub hillstreet-ph/open-connect (main)
    → Cloudflare Pages project open-connect-app
        → open-connect.site / www
    → Supabase project open-connect (gnqpwewbgldonarggzax, ap-northeast-1)
```

## Surfaces

| Surface | URL | Notes |
|---------|-----|--------|
| Health | `/api/v1/health` | Live ok |
| Marketplace | `/resources` | Login to download |
| Studio | `/studio` | Auth workspace |
| Orgs | `/orgs` | Auth |
| Guides | `/guides` | Professional E2E |
| MCP | `/mcp` | Bearer `oc_live_` |
| Models | `/v1` | OpenAI-compatible |
| OAuth | `/.well-known/oauth-authorization-server` | PKCE S256 |
| Downloads | `/downloads/open-connect-control-plane-demo/` | Static demo |

## Supabase

- **Auth:** email + Google + GitHub (configure providers in dashboard)
- **Tables:** profiles, user_roles, resources (41), api_keys, app_connections, organizations, projects, gateway_requests, system_jobs, resource_embeddings, agent_vault
- **Storage:** avatars, resource-assets, user-uploads, mcp-artifacts
- **Jobs:** pg_cron `oc-hourly-maintenance`; pgmq `oc_connection_events`, `oc_gateway_jobs`
- **Edge Functions (deployed):**
  - `health` — JWT off — `https://gnqpwewbgldonarggzax.supabase.co/functions/v1/health`
  - `get_secret` — JWT on — `?service_name=`
  - `add_secret` — JWT on — POST body
  - `connection-webhook` — optional `x-oc-webhook-secret`

## Cloudflare Pages (manual gate if deploy stuck)

1. Dashboard → Workers & Pages → **open-connect-app**
2. Production branch: **main**
3. Build: `npm run build` · Output: `dist` · Node 22
4. Env (Production): `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `LITELLM_BASE_URL`, `LITELLM_MASTER_KEY`, `NODE_VERSION=22`
5. **Retry deployment** on latest `main` commit

## Open WebUI / clients

```bash
OPENAI_API_BASE=https://open-connect.site/v1
OPENAI_API_KEY=oc_live_YOUR_KEY
# MCP: https://open-connect.site/mcp
```

## Roles

`user` → `developer` → `publisher` → `admin` → `owner`

## Verify

```bash
curl -sS https://open-connect.site/api/v1/health
curl -sS https://gnqpwewbgldonarggzax.supabase.co/functions/v1/health
curl -sS -o /dev/null -w "%{http_code}\n" https://open-connect.site/studio
```
