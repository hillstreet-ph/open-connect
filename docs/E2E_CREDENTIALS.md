# E2E credential configuration (no secret values)

All credentials were added idempotently. Nothing was revoked, rotated, deleted,
or overwritten. Existing keys/secrets were left exactly as found.

## Local credential store
Path: `/data/home/workspace/.env` (mode 0600).
Backup of the pre-change file: `/data/home/.credential-backups/env_<UTC timestamp>`.

Pre-existing keys preserved: MCP_OPEN_CONNECT_API_KEY, RENDER_API_KEY,
CLOUDFLARE_API_TOKEN, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, SENTRY_DSN,
LINEAR_API_KEY, GITHUB_PERSONAL_ACCESS_TOKEN, OPENROUTER_API_KEY,
OPENCLAW_* ports/state/workspace/gateway token.

Added: ZEABUR_TOKEN, SENTRY_ORG_TOKEN, SENTRY_PERSONAL_TOKEN, SUPABASE_PAT,
COMPOSIO_API_KEY, DATABRICKS_TOKEN, DATABRICKS_EMBEDDINGS_TOKEN,
DATABRICKS_SYNC_SECRET, DATABRICKS_HOST, DATABRICKS_WORKSPACE_PATH,
CLOUDFLARE_USER_TOKEN, CLOUDFLARE_ACCOUNT_TOKEN, CLOUDFLARE_ACCOUNT_ID,
R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_S3_ENDPOINT,
DOCKERHUB_USERNAME, DOCKERHUB_TOKEN.

## GitHub Actions secrets (repo hillstreet-ph/open-connect)
New: SUPABASE_PAT, SENTRY_AUTH_TOKEN, SENTRY_ORG_TOKEN, R2_ACCESS_KEY_ID,
R2_SECRET_ACCESS_KEY, R2_S3_ENDPOINT, COMPOSIO_API_KEY, LINEAR_API_KEY, GH_PAT.
Already present and untouched: ZEABUR_TOKEN, ZEABUR_API_KEY,
CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, DATABRICKS_TOKEN,
DATABRICKS_SYNC_SECRET, DOCKERHUB_USERNAME, DOCKERHUB_TOKEN, and the
SUPABASE_* / OPENROUTER_* / OPENAI_* / AUTOMATION_TOKEN / CLAWHUB_TOKEN /
FIRECRAWL_API_KEY entries.

Railway tokens were NOT stored as secrets: both supplied workspace tokens were
rejected by Railway CLI v5.74.1 as Unauthorized (tested under both
RAILWAY_TOKEN and RAILWAY_API_TOKEN, with a clean CLI config). Existing Railway
device login remains intact and both Railway lanes are healthy.

## Verification results
| Integration | Result |
| --- | --- |
| Supabase PAT | Valid; lists 2 projects, both ACTIVE_HEALTHY |
| Sentry MCP connector | Already connected; org hillstreet (US region) visible |
| Sentry personal token | Valid via REST API |
| Sentry org token | 403 (region-scoped); personal token used for REST |
| Cloudflare user/account tokens | Valid (active) |
| Cloudflare R2 S3 keys | Valid; list-objects works on both buckets |
| Databricks token | Valid (kairocasino8@gmail.com) |
| Databricks AI Gateway embeddings | 200, model gte-large-en-v1.5 |
| Linear token | Valid with bare Authorization header (not Bearer) |
| Composio key | DNS for api.composio.dev does not resolve in this sandbox |
| GitHub token | Valid; used for secret writes |
| Docker Hub PAT | Valid via registry login API |
| Zeabur token | Valid (kairocasino8) |
| Railway tokens | Unauthorized (both supplied tokens) |

## Outstanding blockers (not credential-related)
1. Supabase org `qbromdeoidotfakgtsvj` (Kobeplay) has unpaid invoices.
   `POST /v1/projects/{ref}/restore` returns HTTP 402 for both projects:
   "This organization has unpaid invoices. Settle outstanding payments before
   trying to restore project." Storage migration cannot start until settled.
2. No valid Railway workspace/project token supplied. Existing device login
   continues to work for deploys.

## Tooling
`unity-gateway` v0.2.1+174.g1f21ab7 installed via uv (executables `ucode`, `ug`).
