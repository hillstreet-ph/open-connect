# Sentry & Zeabur — brokered providers

**Rule:** Vault → credential broker → capability. Never put tokens, SSH passwords, or provider master keys in git, prompts, screenshots, or client responses.

## Stack boundary

| Layer | Host |
|-------|------|
| Edge / app | Cloudflare Pages · `open-connect.site` |
| Data / Auth | Supabase |
| Source | GitHub `hillstreet-ph/open-connect` |
| **Optional runtime** | Zeabur (long-running processes only, e.g. LiteLLM proxy) |
| **Observability** | Sentry (errors/performance) |

Open Connect production edge does **not** require Zeabur. Zeabur is for optional workers that cannot run on Pages.

## Sentry (HillStreet org)

- Connection record: `app_connections.provider = sentry`
- Credential reference: `vault:sentry_org_token` / personal token reference
- UI shows: org, region, status, last validated — **not** token values
- Tokens must live in operator vault (1Password / Pages secret / Supabase Vault), not in resource manifests

## Zeabur (optional)

Metadata allowed in DB:

- `project_id`, `server_id`, `ssh_host`, `ssh_user`
- `ssh_port` after setup

**Never commit:** SSH password, API tokens.

Suggested use:

1. Deploy LiteLLM Proxy container on Zeabur when needed
2. Set Pages `LITELLM_BASE_URL` to that proxy `/v1`
3. Keep OpenRouter or provider keys only on the proxy host

## Production env still required on Pages

For full gateway health:

| Secret | Purpose |
|--------|---------|
| `SUPABASE_SERVICE_ROLE_KEY` | Server RLS bypass |
| `LITELLM_MASTER_KEY` | OpenRouter (or LiteLLM) upstream key |

If either is missing, `/api/v1/health` shows `model_upstream: null`.

## Rotation

Credentials shared in chat or screenshots are **exposed**. Rotate Sentry tokens and Zeabur SSH password at the providers after setup, then update vault references only.
