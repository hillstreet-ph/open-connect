# Persistence — Open-Connect (Railway)

## Classification

| Data | Classification | Where it lives | Retention |
|------|---------------|----------------|-----------|
| Control-plane runtime state | EPHEMERAL | `/app` container filesystem | tied to deployment |
| Database | PERSISTENT | Supabase `open_platform` / `open_connect` | Supabase backup SLA |
| Credentials | PERSISTENT | Open-Connect credential vault (`vault://`) | vault backup SLA |
| Config / variables | PERSISTENT | Railway sealed variables + IaC | IaC + vault |
| Audit events / sessions | PERSISTENT | Supabase (via control plane) | Supabase backup SLA |

## Volumes

**No Railway volume is created.** The control plane is intentionally stateless:

- It contains no uploaded user documents (those are in Supabase Storage / vault).
- It holds no session files, caches, or indexes on disk that must survive a
  redeployment (sessions are held in memory and backed by Supabase).
- Introducing a volume would add restart-latency, overlapping-deployment, and
  data-migration risk with zero durability benefit.

## Persistence verification

- Confirm `railway service get control_plane` reports no `mount`/volume.
- Confirm `/healthz` returns `environment=production` after a redeploy (state is
  rebuilt, not lost).
- Confirm Supabase backup is enabled and verifiable (see `docs/RAILWAY_BACKUP.md`).
