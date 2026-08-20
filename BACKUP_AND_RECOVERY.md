# Backup, deploy hygiene & recovery

## Automatic database backups (Supabase)

| Item | Detail |
|------|--------|
| Table | `public.oc_backups` (last 30 snapshots retained) |
| Function | `public.oc_create_backup(label)` |
| Cron | `oc-daily-backup` — `15 3 * * *` UTC |
| Also | `oc-hourly-maintenance` — health counts into `system_jobs` |

Each snapshot stores JSON of:
- row counts (resources, api_keys, profiles, gateway_requests)
- full `resources` catalog
- api_keys **metadata only** (never raw key hashes reused as secrets in logs — hashes are stored for restore of metadata; regenerate keys if DB is fully lost)
- profiles

### Manual backup
```sql
select public.oc_create_backup('manual');
```

### Restore resources from latest snapshot
```sql
-- inspect
select id, label, created_at, snapshot->'counts' from public.oc_backups order by created_at desc limit 5;

-- example: re-insert missing resources from snapshot (run carefully)
-- use dashboard SQL or a migration after reviewing snapshot->'resources'
```

### Supabase platform backups
Pro plans include daily backups / PITR in the dashboard under **Database → Backups**. Enable PITR if available for point-in-time recovery beyond app-level snapshots.

---

## Cloudflare Pages

- Project: `open-connect-app`
- Production branch: `main` (auto-deploy on push)
- Domains: `open-connect.site`, `www.open-connect.site`, `*.open-connect-app.pages.dev`
- Failed/skipped historical deployments were pruned; only successful production history retained.

### Env secrets (never commit)
`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `LITELLM_BASE_URL`, `LITELLM_MASTER_KEY`, `GITHUB_CLIENT_SECRET`

Redeploy does **not** wipe Supabase data. Losing Cloudflare only loses the edge app — restore by pushing `main` again.

---

## Source of truth (prevent starting from scratch)

1. **GitHub** `hillstreet-ph/open-connect` — all code + migrations under `supabase/migrations/`
2. **Supabase** — live data + `oc_backups` + cron
3. **Cloudflare** — edge runtime + secrets + custom domain

If Cloudflare crashes: push any commit to `main` or retry deployment in Pages UI.  
If Supabase data is damaged: restore from `oc_backups` snapshot or Supabase dashboard backup.  
If repo is lost: data remains in Supabase; recreate app from migrations + this runbook.

---

## Model aliases (OpenRouter)

`open-connect/fast|balanced|reasoning|coding|vision` map to OpenAI models that work without Google Cloud billing on the OpenRouter key.

Direct `openai/gpt-4o-mini` also works.

---

## Smoke checklist

```bash
curl -s https://open-connect.site/api/v1/health
curl -s https://open-connect.site/.well-known/oauth-authorization-server
curl -s -H "Authorization: Bearer oc_live_…" https://open-connect.site/mcp
curl -s -H "Authorization: Bearer oc_live_…" https://open-connect.site/v1/models
curl -s -X POST https://open-connect.site/v1/chat/completions \
  -H "Authorization: Bearer oc_live_…" -H "Content-Type: application/json" \
  -d '{"model":"open-connect/fast","messages":[{"role":"user","content":"OK"}],"max_tokens":10}'
```
