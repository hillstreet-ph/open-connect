# Open-Connect — Production status

**Domain:** https://open-connect.site  
**Repo:** [hillstreet-ph/open-connect](https://github.com/hillstreet-ph/open-connect) (`main`)  
**Deploy:** Cloudflare Pages `open-connect-app` auto-deploys from `main`  
**Git:** Pipedream GitHub connector (admin/push) + GitHub MCP

## Live checks

| Surface | Expect |
|---------|--------|
| `/` | 200 marketing home |
| `/api/v1/health` | `status: ok`, model_upstream set |
| `/mcp` | 401 without key (gateway up) |
| `/v1` | 401 without key |
| OAuth discovery | `code_challenge_methods_supported: ["S256"]` |

## Product surfaces

1. **Resources** — Marketplace `/resources`
2. **Connections** — `/connections`
3. **Models** — `/models` + `/v1`
4. **Agents** — `/agents`, MCP `https://open-connect.site/mcp`
5. **API Keys** — scoped `oc_live_` keys
6. **Secrets** — `/secrets` (apply `credential_secrets` SQL if missing)
7. **Auth** — email, OAuth, forgot password
8. **RBAC** — `/admin` for admin/owner

## One-time ops

1. Supabase SQL: `supabase/migrations/20260822040000_credential_secrets.sql`
2. Supabase Auth providers + redirect `https://open-connect.site/auth`
3. Cloudflare Pages secrets: `SUPABASE_*`, `LITELLM_*`, optional `OAUTH_SIGNING_SECRET`

## Deploy path

```text
push to main  →  Cloudflare Pages build  →  open-connect.site
```

No open PRs required for production; ship on `main`.
