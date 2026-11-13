# Railway Migration — Open-Connect

## Scope

| Layer | Owner today | Owner after migration | Changes |
|-------|-------------|-----------------------|---------|
| Control plane (FastAPI) | Zeabur | **Railway** | ✅ Migrated |
| Frontend (web app) | Cloudflare Pages (`open-connect.site`) | Cloudflare Pages | Stays (edge/TLS/DNS) |
| Database | Supabase (`open-platform`) | Supabase | Stays (data, auth, RLS) |
| Analytics / governed memory | Databricks | Databricks | Stays |
| Secrets / credentials | Open-Connect credential vault + Zeabur secrets | Open-Connect vault + Railway sealed variables | ✅ Rearranged, no semantic change |
| DNS / TLS / edge | Cloudflare | Cloudflare | Stays; Railway custom domain `api.open-connect.site` fronted via Cloudflare |

## Why Railway

- Railway is the operator's preferred cloud-runtime for control-plane services.
- Gives immutable image promotion, volume/backup controls, private networking, and
  first-class env isolation for the three-lane topology below.

## Provider responsibility (final boundary)

- **GitHub** = source, branches, CI/CD, release governance.
- **Docker** = control-plane image build, registry, tag/digest.
- **Cloudflare** = DNS, TLS, edge/security, frontend hosting.
- **Supabase** = DB, Auth, RLS, Storage/data services.
- **Railway** = runtime, services, environments, networking, variables, backups.

## Control-plane alignment

The control plane is **stateless at runtime**: it holds no Docker volume. All
configuration and all credentials live in:

1. `control-plane/` `OC_*` variables (see `docs/RAILWAY_VARIABLES.md`), and
2. the Open-Connect credential vault (`vault://*` references).

Consequently the Railway service needs **no persistent volume** — this removes the
single biggest downtime risk of a container migration (volume re-mount during
promotion).

## Open questions (must be resolved before production cutover)

- Railway API token + Cloudflare API token — obtain from the Open-Connect vault.
- Confirm `OC_ENVIRONMENT=production` + `OC_ALLOW_PRODUCTION=true` only in the
  production environment (fail-closed gate).
- Confirm DNS `api.open-connect.site` → Railway custom domain via Cloudflare.
- Confirm no duplicate control-plane service exists on Railway/other clouds.

## Commands (Railway CLI, v5.74.1)

```bash
# Authenticate once (or on each CI runner)
railway login --token <RAILWAY_TOKEN>

# Confirm the project/service exist
railway project get open-connect
railway service get control_plane

# Deploy the linked control_plane service to a lane.
# `railway up` rebuilds the Dockerfile configured in .railway/railway.ts and
# deploys the resulting image. Use the same validated sha artifact that CI
# published (control-plane-docker.yml).
railway up --project open-connect --service control_plane --environment staging
railway up --project open-connect --service control_plane --environment production

# Pin the public custom domain (Cloudflare fronts the traffic; see
# docs/RAILWAY_NETWORKING.md).
railway domain api.open-connect.site --service control_plane --environment production

# Variables (KEY=VALUE; real secrets are sealed via the operator's vault/API
# and never committed).
railway variable set --service control_plane --environment production "OC_ENVIRONMENT=production"
railway variable set --service control_plane --environment production "OC_ALLOW_PRODUCTION=true"

# Verify application readiness (not just deployment)
curl -fsS https://api.open-connect.site/healthz
```
