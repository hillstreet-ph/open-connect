# Open-box → Databricks/R2 and backup janitor maintenance

## What was migrated
- All 10 Supabase `open-box` tables (5 `open_box.*` + 5 `public.x_*`) were exported from
  project `huadtiuuoiriqrjpjxhr` through the Management API read-only endpoint.
- 142 rows were written as JSONL to R2 bucket `open-box-backups` under
  `open-box-db-export/<timestamp>/` with a SHA-256 + size manifest, and to the
  Databricks volume `open_connect.supabase_migration.raw_files/open-box-export/<timestamp>/`.
- Every R2 object was re-fetched and verified by SHA-256 and byte size; the volume was
  verified with `read_files(...)` returning 142 rows.
- The 6 open-box tables already mapped in Databricks were re-counted against the live
  Supabase source; all matched (one table grew from 116 to 119 rows, expected drift).

## Janitor maintenance
- `scripts/supabase_backup_janitor.py` now supports two buckets via the scheduled
  workflow `.github/workflows/supabase-backup-janitor.yml` (hourly, `3 * * * *`).
- `open-box-backups` uses `--flat-sets` (legacy timestamped filenames) and
  `--discover-manifest`, which selects the newest `manifest.json` under
  `/open-box-db-export/` so the migration gate never goes stale.
- Deletion is gated on a fresh, complete, hash-verified R2 export. Dry-run is the
  default; scheduled runs apply retention. The newest backup set is always kept
  (`--keep-newest 1`), so a bucket can never be emptied.
- Applied on 2026-11-17: 14 old open-box backup sets (26 objects) were removed after
  the R2 gate passed. The bucket went from 28 objects / 93,811,534 bytes to
  2 objects / 9,900,976 bytes (newest set retained).
- Each run reports current bucket size in MB and warns when it exceeds the configured
  threshold, so a future storage-full condition is visible before it becomes a 402.

## No credentials were revoked
No token, API key or password was rotated or revoked. R2 and Supabase credentials are
referenced only from environment/secrets.
