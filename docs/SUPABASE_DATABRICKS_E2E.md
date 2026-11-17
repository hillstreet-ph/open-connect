# Supabase → Databricks end-to-end setup

## Sources
- `huadtiuuoiriqrjpjxhr` (open-platform) — 96 exported tables
- `hoseohvgoiarxluxqwqv` (open-operations) — 39 exported tables

Both projects have their data plane (REST/Storage/Auth/Realtime) blocked with HTTP 402
(`exceed_storage_size_quota` + unpaid invoices). The only working read path is the
Supabase Management API read-only SQL endpoint, which is what the sync uses. Supabase
Realtime/WebSockets are therefore **not** usable; "realtime" is 15-minute polling.

## Databricks layout
Catalog `open_connect`, SQL warehouse `dae787fe16c17482`.
- `open_platform` / `open_operations` — 135 physical Delta tables (the sync targets).
- `supabase_migration.raw_files` — original JSONL exports (audit/provenance).
- Per-product view schemas: `open_connect_app` (69), `shared_platform` (39),
  `open_tgate_app` (13), `hillstreet_app` (7), `open_system_app` (6), `open_box_app` (1),
  `open_teleset_app` (0), `kobeplay_app` (0 — no source tables found).
  All 135 views resolve and match source row counts.

## Automation
- `.github/workflows/supabase-databricks-sync.yml` — every 15 min + manual dispatch.
  Uses committed registry `config/supabase/table_registry.json` (135 tables with
  per-table primary-key hints) and a GitHub Actions cache for watermarks at
  `.sync_state/sync_state.json`. Secrets: `SUPABASE_PAT`, `DATABRICKS_TOKEN`,
  `DATABRICKS_HOST`.
- `.github/workflows/supabase-backup-janitor.yml` — daily 03:00 UTC; scheduled runs
  apply deletions, manual dispatch defaults to dry-run. Deletes backup sets older
  than 7 days only after verifying the R2 export gate; requires a non-empty,
  slash-delimited set id so a malformed object name cannot delete root objects.
- Full DB export (135 tables / 259,315 rows / 136 MB) is stored in R2 bucket
  `supabase-backups` under `db-export/<project_ref>/` with a SHA-256-verified manifest.

## Safety properties
- Sync only reads Supabase via `/database/query/read-only`.
- Sync writes are MERGE (upsert) or deduplicated INSERT only — no DELETE/DROP/TRUNCATE.
- Watermarks advance only after all statements for a table succeed.
- "no primary key" tables use append + null-safe anti-join; tables whose JSON object
  columns have truncated DESCRIBE type strings are skipped (they remain covered by
  the full export) instead of emitting invalid SQL.
- No credentials are stored in source or in this document.

## Known limitations
- OFFSET pagination uses a single watermark column; equal-timestamp rows may be
  re-read (safe under MERGE) but ordering is not keyset-stable.
- Tables with no `updated_at`/`created_at` are scanned in full each poll.
- Supabase invoices/quota restriction still require owner payment or support action;
  sync does not attempt any payment or credential revocation.

## Validation (2026-11-17)
- Offline tests: `python3 -m pytest tests/test_supabase_databricks_sync.py -q` → 25 passed.
- Live full sync: 131/135 tables synced cleanly; the remaining 4 were re-run after
  fixes and all succeeded (`storage.objects`, `platform.workspaces`,
  `open_tgate_tg_chats`, `open_tgate_tg_messages`).
- Sampled target row counts: `public.projects` 6, `open_system_sync_events` 30,
  `net._http_response` 506, `platform.workspaces` 1, `tg_chats` 665, `tg_messages` 31,220.
- Janitor dry-run against the live project: gate pass, 0 backup sets to delete.
- Five tables are intentionally skipped by the incremental job because DESCRIBE
  truncates very large nested struct types; their full data remains in the initial
  Databricks migration and the R2 export.


## Shadow mirror, near-realtime watcher, and orchestration

The sync described above now runs as one layer of a four-layer schedule, with a
Databricks-side shadow mirror and a local near-realtime watcher added around it.
See `docs/E2E_SHADOW_AND_REALTIME.md` for the full operator runbook (why the
mirror exists, why true Supabase WebSocket Realtime is unavailable under the
HTTP 402 restriction, manual commands, health/state file locations, failure
recovery, and the five intentionally skipped complex-schema tables).

New/updated schedules (all UTC, with manual dispatch on each workflow):

| Schedule | Workflow | Layer |
| --- | --- | --- |
| every ~60 s (local) + health every 5 min | `.github/workflows/supabase-watcher-health.yml` | near-realtime change detection (`scripts/supabase_realtime_watcher.py`) |
| every 15 min | `.github/workflows/supabase-databricks-sync.yml` | incremental MERGE/append sync (existing) |
| every 30 min | `.github/workflows/databricks-shadow-mirror.yml` | shadow mirror refresh + verify (`scripts/databricks_shadow_mirror.py`, `scripts/verify_e2e_sync.py`) |
| daily 03:00 | `.github/workflows/supabase-backup-janitor.yml` | backup retention janitor (existing) |

Credential key names only — never values — per `docs/E2E_CREDENTIALS.md`. No
payment has been made and the Supabase 402 restriction has not been lifted.
