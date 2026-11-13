# Rollback — Open-Connect control plane

## Failure flow (in order)

1. **FREEZE** — stop any further production promotion.
2. **LOGS / EVIDENCE** — pull `railway service logs --service control_plane`.
3. **ROOT CAUSE** — identify layer (image, variable, dependency, lane).
4. **DB COMPATIBILITY** — confirm rolled-back app code is compatible with the
   live Supabase schema (do not auto-reverse DB migrations).
5. **KNOWN-GOOD DEPLOYMENT** — redeploy the recorded previous SHA
   (see `docs/DEPLOYMENT_RECORD.md`).
6. **HEALTH** — `/healthz` HTTP 200, `/api/v1/capabilities` populated.
7. **E2E** — smoke-test `/api/v1/agents` and one authenticated `/api/v1/capabilities`.

## Rollback tools

- `railway deploy --service control_plane --image hillstreet/open-connect:sha-<OLD>`
  (redeploy the known-good image).
- No Docker volume data is touched during code-only rollback.

## Rollback is NOT

- deleting/replacing volume data,
- silently reversing DB migrations,
- promoting an unverified deployment.

## Success criteria

- Rollback returns `/healthz` to HTTP 200 within a short window.
- `/api/v1/agents` and `/api/v1/capabilities` return correct data.
- No data loss (Supabase is the source of truth for all persisted data).
