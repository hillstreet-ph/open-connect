# Supabase Edge Functions — Open Connect

**Project:** `gnqpwewbgldonarggzax` (open-connect)  
**Base URL:** `https://gnqpwewbgldonarggzax.supabase.co/functions/v1/<name>`

> Primary product edge remains **Cloudflare Pages** (`open-connect.site`).  
> Supabase Edge Functions are **backend helpers** (vault, webhooks, probes), not the public SPA.

## Deployed functions

| Slug | JWT | Role |
|------|-----|------|
| `health` | **false** | Liveness probe for Functions runtime |
| `get_secret` | **true** | Read `agent_vault` row by `service_name` (user JWT) |
| `add_secret` | **true** | Upsert vault entry (user JWT + service role write) |
| `connection-webhook` | **false** | Provider connection events; optional `OC_WEBHOOK_SECRET` |

## Configuration checklist

### 1. Project secrets (Dashboard → Edge Functions → Secrets)

Auto-injected by Supabase (do not commit):

| Secret | Notes |
|--------|--------|
| `SUPABASE_URL` | Project URL |
| `SUPABASE_ANON_KEY` / publishable | User client |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin writes (get/add_secret, webhook) |

Optional:

| Secret | Notes |
|--------|--------|
| `OC_WEBHOOK_SECRET` | If set, `connection-webhook` requires header `x-oc-webhook-secret` |

### 2. `supabase/config.toml`

```toml
project_id = "gnqpwewbgldonarggzax"

[functions.health]
verify_jwt = false

[functions.get_secret]
verify_jwt = true

[functions.add_secret]
verify_jwt = true

[functions.connection-webhook]
verify_jwt = false
```

### 3. CLI deploy (from repo)

```bash
npx supabase login
npx supabase link --project-ref gnqpwewbgldonarggzax
npx supabase functions deploy health --no-verify-jwt
npx supabase functions deploy get_secret
npx supabase functions deploy add_secret
npx supabase functions deploy connection-webhook --no-verify-jwt
```

Source of truth for code should live under `supabase/functions/<name>/index.ts`.

### 4. Invoke examples

```bash
# Health (public)
curl -sS "https://gnqpwewbgldonarggzax.supabase.co/functions/v1/health"

# Get secret (user access token)
curl -sS "https://gnqpwewbgldonarggzax.supabase.co/functions/v1/get_secret?service_name=openrouter" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "apikey: $SUPABASE_ANON_KEY"

# Add secret
curl -sS -X POST "https://gnqpwewbgldonarggzax.supabase.co/functions/v1/add_secret" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"service_name":"demo","secret_value":"…","metadata":{}}'

# Connection webhook
curl -sS -X POST "https://gnqpwewbgldonarggzax.supabase.co/functions/v1/connection-webhook" \
  -H "Content-Type: application/json" \
  -H "x-oc-webhook-secret: $OC_WEBHOOK_SECRET" \
  -d '{"provider":"github","event":"connected","payload":{}}'
```

## Security notes

- Prefer **capability broker** on Cloudflare/Pages for production secrets; Edge vault is a helper.
- `get_secret` currently returns stored value to authenticated callers — enforce ownership RLS / user_id filters before treating as multi-tenant safe.
- Keep `verify_jwt: true` on vault functions.
- Set `OC_WEBHOOK_SECRET` in production for webhooks.

## Relation to open-connect.site

| Surface | Host |
|---------|------|
| Marketing, Studio, `/v1`, `/mcp`, OAuth product | Cloudflare Pages |
| Auth users, Postgres, RLS, Storage | Supabase |
| Vault helper + connection webhook | Supabase Edge Functions |
