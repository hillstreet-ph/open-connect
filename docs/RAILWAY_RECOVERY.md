# Disaster Recovery — Open-Connect control plane

## Recovery objective (reconstruct)

Reconstruct:
`SOURCE` (GitHub) + `ARTIFACT` (Docker image digest) + `RAILWAY IaC/CONFIG`
(`.railway/railway.ts`) + `VARIABLE/SECRET CONTRACT` (docs/RAILWAY_VARIABLES.md) +
`DOMAINS` (api.open-connect.site via Cloudflare) + `DATABASE` (Supabase)
+ `VOLUMES` (none) + `EXTERNAL STORAGE` (vault)

## Recovery steps

1. Restore GitHub source at the recorded SHA.
2. Pull the recorded image digest from the registry (`docker pull`).
3. Recreate Railway project/services from `.railway/railway.ts`
   (`railway up --project open-connect`).
4. Re-set all sealed variables from the vault (docs/RAILWAY_VARIABLES.md).
5. Re-point DNS: Cloudflare CNAME `api.open-connect.site` → Railway origin.
6. Reconfirm `/healthz` and `/api/v1/capabilities`.
7. Restore Supabase schema/migration state from `docs/DEPLOYMENT_RECORD.md`.
8. Verify backups by spot-checking a restore into a staging environment.

## Monitoring (continuous, not just deployment healthchecks)

- Railway deployment health (build/deploy/restart metrics).
- `/healthz` and `/api/v1/capabilities` inbound.
- Dependency reachability: Supabase, LiteLLM/OpenRouter.
- Error rate, latency, crashes.
- Vault resolution health for worker lanes.
