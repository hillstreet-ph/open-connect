# Railway IaC — Open-Connect control plane

Single source of truth for deploying `hillstreet-ph/open-connect`'s control
plane (FastAPI) on Railway. See **docs/RAILWAY.md**, **docs/RAILWAY_VARIABLES.md**,
**docs/RAILWAY_DEPLOYMENT.md**, and **docs/DEPLOYMENT_RECORD.md** for the
full migration.

## Files

| Path | Purpose |
|------|---------|
| `.railway/railway.ts` | Railway IaC: project, environments, `control_plane` service, variables, custom domain |
| `.railway/README.md` | This file |
| `docs/RAILWAY.md` | Migration overview & provider responsibility |
| `docs/RAILWAY_ARCHITECTURE.md` | Environment/service topology map |
| `docs/RAILWAY_VARIABLES.md` | Variable & secret contract (type, owner, status — no values) |
| `docs/RAILWAY_DEPLOYMENT.md` | Staging → production deployment procedure with the production gate |
| `docs/RAILWAY_NETWORKING.md` | Private/public networking & domain routing (Cloudflare) |
| `docs/RAILWAY_PERSISTENCE.md` | Persistent paths & volume classification |
| `docs/RAILWAY_CRON.md` | Scheduled jobs (none for the control plane; documented) |
| `docs/RAILWAY_BACKUP.md` | Backup strategy (Supabase + vault, no Docker volume) |
| `docs/RAILWAY_ROLLBACK.md` | Rollback plan & known-good state |
| `docs/RAILWAY_RECOVERY.md` | Disaster-recovery reconstruction steps |
| `docs/DEPLOYMENT_RECORD.md` | Machine-readable release record (SHA, image, project, env, verification) |
| `.github/workflows/railway-deploy.yml` | CI workflow that deploys to Railway on release |

## Commands

```bash
# Authenticate once
railway login --token <RAILWAY_TOKEN>

# Validate IaC without touching production
railway up --service control_plane --env staging --dry-run   # (if supported)
railway link --project open-connect --environment staging    # once per env

# Apply IaC from this file
railway up --project open-connect

# Add the custom domain (assigned via Cloudflare DNS)
railway domain add control_plane api.open-connect.site
```

## Secret policy

- All `OC_*` values in this file are **PLAIN_TEXT configuration or
  `vault://` references — not secrets**.
- Genuinely secret values (for example, values that were previously set as
  `ZEABUR_TOKEN` on Zeabur) are migrated to **Railway sealed variables** via
  `railway variables set --secret` and are never written to this file or to the
  image. See `docs/RAILWAY_VARIABLES.md`.
