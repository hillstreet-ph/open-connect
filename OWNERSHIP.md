# Open-Connect ownership (no Lovable Cloud)

Production domain: https://open-connect.site  
Source: https://github.com/hillstreet-ph/open-connect  
Database: https://gnqpwewbgldonarggzax.supabase.co

## Cloudflare Pages (required env)

Dashboard → Workers & Pages → **open-connect-app** → Settings → Environment variables → **Production**

Set these (encrypted/secret where noted):

| Variable | Value |
|----------|--------|
| `SUPABASE_URL` | `https://gnqpwewbgldonarggzax.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | your `sb_publishable_…` |
| `SUPABASE_SERVICE_ROLE_KEY` | your service role JWT (secret) |
| `VITE_SUPABASE_URL` | same as `SUPABASE_URL` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | same as publishable key |
| `VITE_APP_URL` | `https://open-connect.site` |
| `LITELLM_BASE_URL` | `https://openrouter.ai/api/v1` |
| `LITELLM_MASTER_KEY` | your OpenRouter `sk-or-v1-…` (secret) |

After saving, **Retry deployment** so `model_upstream` is no longer `null` on `/api/v1/health`.

Your API token needs **Account → Cloudflare Pages → Edit** to manage this via API.

## Supabase Auth

Already configured for this project:

- Site URL: `https://open-connect.site`
- Redirect allow list includes site + `*.pages.dev` + localhost
- Email signup enabled
- Google/GitHub OAuth: **disabled** until you add client IDs under Authentication → Providers

Email signup/login/reset works without Lovable.

## What was removed from owner control path

- Committed `.env` pointing at Lovable project `nnhlicrciivdxvzuytze`
- Auth Google flow via `@lovable.dev/cloud-auth-js` (now pure `supabase.auth.signInWithOAuth`)
- Error strings that said “Connect Supabase in Lovable Cloud”

Build still uses the public npm package `@lovable.dev/vite-tanstack-config` as the Vite plugin host. That is **not** Lovable Cloud hosting — it is only a build dependency. Runtime secrets and data are on your Cloudflare + Supabase.

## Smoke tests

```bash
curl https://open-connect.site/api/v1/health
# expect model_upstream: "openrouter" after env is set

curl -H "Authorization: Bearer oc_live_YOUR_KEY" https://open-connect.site/v1/models
curl -H "Authorization: Bearer oc_live_YOUR_KEY" https://open-connect.site/mcp
```
