# Deployment Record — Open-Connect control plane (Railway)

Machine-readable release record. **No secret values.**

Migrated from Zeabur (control-plane FastAPI served via `Zeabur.Dockerfile`) to
Railway. The public web application remains on Cloudflare Pages at
`https://open-connect.site`.

| Field | Value | Status |
|-------|-------|--------|
| release | open-connect control-plane migrated Zeabur → Railway | DONE |
| git_sha | 7252175089527aba2e6d91f9f71e917bcd4aaccc (cutover commit; this record follows it) | DONE |
| artifact_image | Built by Railway from root `Dockerfile` (mirrors `Zeabur.Dockerfile`) | DONE |
| artifact_digest | Railway image digest (see deployment meta) | DONE |
| railway_workspace | Kobeplay Workspace | DONE |
| railway_project | open-connect (id 0a87be1b-4e00-42a2-94b6-a2f79e0eed2b) | DONE |
| railway_environment | production (id from `railway environment list`) | DONE |
| railway_service | open-connect (id bcf78b0e-a637-4382-88ce-0297dafbca63) | DONE |
| deployment_identity | 64dcb180-d04c-4fac-b97c-34d6381aaa0f | DONE |
| db_migration_state | Supabase open_connect schema (unchanged by this migration) | N/A |
| previous_known_good_sha | 1ef9bbd8-bf69-4a88-a452-f1030ae4e2d3 (superseded) | DONE |

## Verified lanes

| Lane | Service | Domain | Build | /healthz | TLS |
|------|---------|--------|-------|----------|-----|
| production | open-connect | https://api.open-connect.site | DOCKERFILE (`/Dockerfile`) | HTTP 200 `{"status":"ok","environment":"production"}` | VALID |
| staging | open-connect-staging | https://control-staging.open-connect.site | DOCKERFILE (`/Dockerfile`) | HTTP 200 `{"status":"ok","environment":"staging"}` | VALID |

## Verification evidence (2026-11-16)

- `railway deployment list -e production --json` → deployment `64dcb180` SUCCESS,
  `builder: DOCKERFILE`, `dockerfilePath: /Dockerfile`.
- `railway ssh -s open-connect -e production python -c ...` → in-container
  `/healthz` answered `{"status":"ok","environment":"production"}`.
- `curl -fsS https://api.open-connect.site/healthz` → HTTP 200 (cert VALID,
  domain Verified).
- `railway deployment list -s open-connect-staging -e staging --json` →
  deployment `3b12f8fe-f3c4-4df6-92f7-321d476d7142` SUCCESS, DOCKERFILE.
- `curl -fsS https://control-staging.open-connect.site/healthz` → HTTP 200
  `{"status":"ok","environment":"staging"}` (cert VALID, domain Verified).

## Production safety

- `OC_ENVIRONMENT=production` and `OC_ALLOW_PRODUCTION=true` are both set on the
  production service; staging sets `OC_ENVIRONMENT=staging` and
  `OC_ALLOW_PRODUCTION=false`. The app's `Settings.assert_safe()` fails closed
  if the production gate is missing.
- Credential references are `vault://` URIs only; no literal secrets are stored
  in Railway variables committed to this repository, in the IaC, or in the image.

## Rollback

`railway deployment list -e production` identifies the previous known-good
deployment; `railway service redeploy --service open-connect --environment
production` or a promoted re-deploy restores it. See `docs/RAILWAY_ROLLBACK.md`.
