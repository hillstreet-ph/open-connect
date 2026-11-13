# Sentry & Zeabur — brokered providers

**Rule:** Vault → credential broker → capability. Never put tokens, SSH passwords, or provider master keys in git, prompts, screenshots, or client responses.

## Stack boundary

| Layer | Host |
|-------|------|
| Edge / app | Cloudflare Pages · `open-connect.site` |
| Data / Auth | Supabase |
| Source | GitHub `hillstreet-ph/open-connect` |
| **Server/API runtime** | Zeabur · `api.open-connect.site` |
| **Observability** | Sentry (errors/performance) |

Cloudflare Pages owns `open-connect.site`. Zeabur owns the backend API, control-plane, and long-running workers; it must not attach or compete for the apex domain.

## Sentry (HillStreet org)

- Connection record: `app_connections.provider = sentry`
- Credential reference: `vault:sentry_org_token` / personal token reference
- UI shows: org, region, status, last validated — **not** token values
- Tokens must live in operator vault (1Password / Pages secret / Supabase Vault), not in resource manifests

## Zeabur server boundary

Metadata allowed in DB:

- `project_id`, `server_id`, `ssh_host`, `ssh_user`
- `ssh_port` after setup

**Never commit:** SSH password, API tokens.

Suggested use:

1. Deploy the immutable `hillstreet/open-connect` control-plane image to Zeabur
2. Attach only `api.open-connect.site` (or a provider-generated staging hostname)
3. Verify `/healthz` before changing DNS
4. Keep `open-connect.site` and `www.open-connect.site` exclusively on Cloudflare Pages
5. Keep server-only Supabase, OpenRouter, and provider credentials in Zeabur secrets

## Production env still required on Pages

For full gateway health:

| Secret | Purpose |
|--------|---------|
| `SUPABASE_SERVICE_ROLE_KEY` | Server RLS bypass |
| `LITELLM_MASTER_KEY` | OpenRouter (or LiteLLM) upstream key |

If either is missing, `/api/v1/health` shows `model_upstream: null`.

## Rotation

Credentials shared in chat or screenshots are **exposed**. Rotate Sentry tokens and Zeabur SSH password at the providers after setup, then update vault references only.
