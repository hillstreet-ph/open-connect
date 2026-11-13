# Deployment Procedure — Staging → Production (railway-e2e-setup)

Operational runbook for the open-connect control-plane migration onto Railway.

## Pre-flight checks (run on every deploy)

1. `railway login --token "$RAILWAY_TOKEN"` — authenticated.
2. `railway project get open-connect` — project exists.
3. `railway service get control_plane` — service exists.
4. IaC syntax: `npx tsx .railway/railway.ts` (structural check) OR
   `railway up --project open-connect --env staging --dry-run` if supported.
5. Secrets sync: confirm every sealed variable scheduled for the environment is
   present and unsealed. Verify none are missing (docs/RAILWAY_VARIABLES.md).
6. Supabase connectivity and schema target (`open_connect`) confirmed — not touched
   by this deploy.
7. Prevents duplicate: no other `control_plane` service/environment on the project.

## Build / artifact

The deploy artifact is always the **immutable Docker image built from
`control-plane/Dockerfile`** (context `./control-plane`), tagged with the Git
SHA:

```bash
docker build -t hillstreet/open-connect:sha-$(git rev-parse --short HEAD) -f control-plane/Dockerfile .
```

Railway reads this Dockerfile natively (`.railway/railway.ts`: `dockerfilePath`
`../control-plane/Dockerfile`, `buildContext: ".."`).

## 1. Deploy to STAGING

```bash
railway up --project open-connect --environment staging
```

- Do NOT set `OC_ALLOW_PRODUCTION=true` on staging.
- Wait for **Railway deployment healthcheck** to pass (TCP on `$PORT`).
- Prove application readiness (NOT just deployment):
  ```bash
  curl -fsS https://<staging-domain>/healthz   # HTTP 200, environment=staging
  ```
- Verify `/api/v1/capabilities` returns provider metadata (authenticated).
- Verify variables echoed correctly (no secrets in logs).

## 2. Staging verification checklist

- [ ] TCP port open on `$PORT` (Railway healthcheck)
- [ ] `/healthz` HTTP 200, `environment=staging`
- [ ] `/api/v1/capabilities` returns non-empty provider map
- [ ] CORS `Allowed-Origins` header reflects `OC_ALLOWED_ORIGINS`
- [ ] Vault references resolve (E2B/OpenBrowser/browser-worker/guacamole/model-gateway)
- [ ] No crash-loop, no restart loop, memory/CPU nominal
- [ ] Staging deploy is the same artifact that will be promoted to production

## 3. Production gate (required before deploy/promote)

| Gate | Evidence |
|------|----------|
| `CI_PASSED` | GitHub Actions `ci.yml` green on main |
| `ARTIFACT_VERIFIED` | Docker image digest confirmed on registry |
| `SECURITY_PASSED` | Snyk/stackhawk/secret scan green |
| `STAGING_DEPLOYED` | Staging healthz HTTP 200 |
| `STAGING_VERIFIED` | staging checks above all pass |
| `BACKUP_READY` | Supabase backup + vault snapshot available |
| `ROLLBACK_READY` | previous digest known, `railway rollback` documented |
| `APPROVED` | explicit production approval recorded |

## 4. Promote to PRODUCTION (fail-closed)

```bash
# 1) production env vars: lane = production, gate = true
railway variables set --service control_plane --environment production "OC_ENVIRONMENT=production"
railway variables set --service control_plane --environment production "OC_ALLOW_PRODUCTION=true"

# 2) deploy exactly the same validated image
railway up --service control_plane --environment production

# 3) wait for healthcheck, then prove /healthz
curl -fsS https://api.open-connect.site/healthz
```

- The fail-closed gate `OC_ALLOW_PRODUCTION=true` is required for this deploy to
  start (pydantic `Settings.assert_safe()`).
- Keep the previous deployment identity recorded in `docs/DEPLOYMENT_RECORD.md`.

## 5. Post-deploy production verification

- [ ] `/healthz` HTTP 200, `environment=production`
- [ ] `/api/v1/capabilities` returns providers
- [ ] Public route `https://api.open-connect.site/` reaches the control plane
- [ ] TLS terminates at Cloudflare → Railway origin
- [ ] No unexpected restarts, no rolling errors
- [ ] Browser/profile worker lanes healthy (E2B/OpenBrowser etc.)
- [ ] Supabase connectivity intact
- [ ] Monitoring/alerting chain live (see `docs/RAILWAY_RECOVERY.md`)

## 6. Rollback

```bash
# restore the previously recorded, known-good deployment
railway up --project "$RAILWAY_PROJECT" \
  --service control_plane --environment production
# then re-verify /healthz
```

Do NOT reverse a DB migration when rolling back app code.

## Rollback / known-good record

Record the previous good deployment in `docs/DEPLOYMENT_RECORD.md` before every
production deploy so rollback is always to a known-good artifact.
