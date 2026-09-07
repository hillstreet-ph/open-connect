# Open Connect — multi-platform deploy map

**Primary domain:** https://open-connect.site  
**Canonical repo:** hillstreet-ph/open-connect · branch `main`

## Production path (required)

```text
GitHub (main)
    → Cloudflare Pages project open-connect-app
        → https://open-connect.site
    → Supabase project gnqpwewbgldonarggzax
        → Auth · Postgres · RLS · Storage · Edge Functions
```

| Platform | Role |
|----------|------|
| **GitHub** | Source of truth, Actions, releases |
| **Cloudflare** | DNS, TLS, Pages edge, KV `OC_KV`, WAF |
| **Supabase** | Database, Auth, RLS, vault references |

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

## Optional platforms

| Platform | Role | Status |
|----------|------|--------|
| **Sentry** | Error / performance observability | Connection metadata in `app_connections`; DSN via vault only |
| **Zeabur** | Optional long-running runtime (e.g. LiteLLM proxy, workers) | **Not** the public edge; metadata configured |
| **Docker Hub** | Optional OCI images for Zeabur/workers | No Dockerfile on OC app today — add only if shipping a worker image |

Open Connect **edge does not require** Docker Hub or Zeabur. Independent products may use them separately.

## Deploy checklist

1. Merge to `main` on GitHub  
2. Cloudflare Pages auto-builds (`bun install --frozen-lockfile && bun run build` → `dist`)  
3. Confirm `/api/v1/health` → `status: ok`, `model_upstream: openrouter`  
4. Confirm custom domains `open-connect.site` / `www` active  
5. Optional: configure Sentry DSN as Pages secret when wiring `@sentry/*`  
6. Optional: deploy LiteLLM on Zeabur → point `LITELLM_BASE_URL` at that proxy  

## Identity (control plane)

Org **Owner / Admin / Member** · Project **Manager / Developer / Viewer** · Machine principals  
See [IDENTITY_MODEL.md](./IDENTITY_MODEL.md).

## Rule

Secrets: Vault → broker → capability. Never commit tokens, SSH passwords, or service role keys to git.
