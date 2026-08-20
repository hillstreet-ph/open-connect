# Open-Connect — Supabase production setup

Project: `gnqpwewbgldonarggzax` · Region: `ap-northeast-1` · URL: `https://gnqpwewbgldonarggzax.supabase.co`

## Configured automatically

### Storage buckets
| Bucket | Public | Purpose |
|--------|--------|---------|
| `avatars` | yes | User profile images |
| `resource-assets` | yes | Catalog icons / media |
| `user-uploads` | no | Per-user files (`{user_id}/…`) |
| `mcp-artifacts` | no | Agent/MCP artifacts |

RLS: public read on public buckets; authenticated users only access their own folder in private buckets.

### Extensions
`pg_cron`, `pg_net`, `vector`, `supabase_vault`, `pgmq`

### Cron
- Job `oc-hourly-maintenance` — schedule `0 * * * *`
- Calls `public.oc_maintenance_ping()` and writes to `public.system_jobs`

### Queues (pgmq)
- `oc_connection_events`
- `oc_gateway_jobs`

### Vault secrets (names)
- `open_connect_app_url`
- `model_upstream_name`
- `google_oauth_client_id`
- `google_oauth_client_secret`

### Vectors
- Table `public.resource_embeddings` (vector 1536 + IVFFlat)

### Catalog status
- 31 published resources · API keys · profiles · OAuth client **Open-Connect Platform** in `auth.oauth_clients`

---

## Google sign-in (dashboard — 2 minutes)

1. Open **Auth → Providers → Google** in the Supabase dashboard for this project.
2. Enable Google.
3. Paste the Google OAuth **Client ID** and **Client secret** from Google Cloud Console (Web client `open-connect`).
4. Save.

### Google Cloud Console checklist
- Redirect URI: `https://gnqpwewbgldonarggzax.supabase.co/auth/v1/callback`
- Origins: `https://open-connect.site`, `https://www.open-connect.site`

### Supabase URL configuration
- Site URL: `https://open-connect.site`
- Redirect allow list: `https://open-connect.site/**`, `https://*.open-connect-app.pages.dev/**`

The `/auth` page already exposes **Continue with Google** and **Continue with GitHub**.

---

## Supabase Auth OAuth/OIDC endpoints

- OpenID: `https://gnqpwewbgldonarggzax.supabase.co/auth/v1/.well-known/openid-configuration`
- JWKS: `https://gnqpwewbgldonarggzax.supabase.co/auth/v1/.well-known/jwks.json`
- Authorize: `https://gnqpwewbgldonarggzax.supabase.co/auth/v1/oauth/authorize`
- Token: `https://gnqpwewbgldonarggzax.supabase.co/auth/v1/oauth/token`

Product MCP OAuth (ChatGPT plugins) lives on the app:
- `https://open-connect.site/.well-known/oauth-authorization-server`
- `/oauth/authorize` · `/oauth/token` · `/oauth/register`
