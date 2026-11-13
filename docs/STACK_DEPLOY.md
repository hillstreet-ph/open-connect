# Open Connect — multi-platform deploy map

**Primary domain:** https://open-connect.site  
**Canonical repo:** hillstreet-ph/open-connect · branch `main`

## Production path (required)

```text
GitHub (main)
    → Cloudflare Pages project open-connect-app
        → https://open-connect.site
    → Docker Hub image hillstreet/open-connect
        → Zeabur API service
            → https://api.open-connect.site
    → Supabase project huadtiuuoiriqrjpjxhr
        → Auth · Postgres · RLS · Storage · Edge Functions
```

| Platform | Role |
|----------|------|
| **GitHub** | Source of truth, Actions, releases |
| **Cloudflare** | DNS, TLS, Pages edge, KV `OC_KV`, WAF |
| **Supabase** | Database, Auth, RLS, vault references |
| **Docker Hub** | Immutable Open-Connect control-plane API images |
| **Zeabur** | API/server runtime only; never the apex frontend owner |

Pages production branch: **`main`** only.

### Required Pages secrets

| Variable | Required |
|----------|----------|
| `SUPABASE_URL` | yes |
| `SUPABASE_PUBLISHABLE_KEY` | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** (server) |
| `LITELLM_BASE_URL` | yes (OpenRouter base) |
| `LITELLM_MASTER_KEY` | **yes** (OpenRouter key) |
| `VITE_APP_URL` | recommended |
| `VITE_SUPABASE_URL` | recommended |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | recommended |

## Supporting platforms

| Platform | Role | Status |
|----------|------|--------|
| **Sentry** | Error / performance observability | Connection metadata in `app_connections`; DSN via vault only |
| **Zeabur** | Backend API, control-plane and long-running workers | Origin at `api.open-connect.site`; never attach `open-connect.site` |
| **Docker Hub** | OCI source for Zeabur API/control-plane | `hillstreet/open-connect`; pin a release or SHA tag in production |

Cloudflare Pages owns the frontend and apex. Zeabur owns only server workloads. Supabase remains the only primary database/Auth/Storage owner.

## Deploy checklist

1. Merge to `main` on GitHub
2. Cloudflare Pages auto-builds (`bun install --frozen-lockfile && bun run build` → `.output/public`)
3. Confirm `/api/v1/health` → `status: ok`, `model_upstream: openrouter`
4. Confirm custom domains `open-connect.site` / `www` active
5. Optional: configure Sentry DSN as Pages secret when wiring `@sentry/*`
6. Deploy the validated control-plane image to Zeabur and verify `https://api.open-connect.site/healthz`
7. Keep `open-connect.site` and `www.open-connect.site` attached only to Cloudflare Pages

## Identity (control plane)

Org **Owner / Admin / Member** · Project **Manager / Developer / Viewer** · Machine principals  
See [IDENTITY_MODEL.md](./IDENTITY_MODEL.md).

## Rule

Secrets: Vault → broker → capability. Never commit tokens, SSH passwords, or service role keys to git.
