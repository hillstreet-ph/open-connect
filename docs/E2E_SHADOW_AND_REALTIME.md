# Supabase → Databricks: shadow mirror, near-realtime watcher, and orchestration

Operator runbook for the layers added around the core Supabase → Databricks sync.
Read `docs/SUPABASE_DATABRICKS_E2E.md` first for the source layout, registry, and
safety properties; this document covers the shadow mirror, the near-realtime
watcher, the offline verifier, and the four-layer schedule that ties them
together.

Credential handling follows the key-names-only convention in
`docs/E2E_CREDENTIALS.md`: every credential below is referred to by **key name
only**, never by value. No payment has been made and the Supabase restriction
described below has **not** been lifted.

> All scripts and workflows named here have landed and were verified together
> in commits e7b80b6, 3857076, and 0455371; the paths and flags in the workflow
> YAML match this runbook.

## Why a shadow mirror exists

Supabase is the **source of truth**. Databricks is a downstream analytics and
audit target. The incremental sync (`scripts/supabase_databricks_sync.py`) writes
to the Databricks target tables using per-table watermarks, which are optimized
for catching up rather than for answering "does the target exactly match the
source right now?".

The **shadow mirror** is a second, Databricks-side copy of the *current target
tables* (`open_connect.open_platform` / `open_connect.open_operations`), rebuilt
with `CREATE OR REPLACE TABLE ... AS SELECT` under `open_connect.shadow`. It is
NOT an independent re-read of the Supabase source: it detects drift introduced
between two Databricks snapshots, not source-to-target drift. It exists to:

- give operators a point-in-time Databricks-side reference to compare against
  later target-table changes;
- keep a queryable Databricks-side copy of tables the incremental job skips
  (see the complex-schema tables below);
- separate *refresh* (materialize the mirror) from *verify* (compare mirror vs.
  target) so snapshot drift can be checked on its own cadence.

Source-to-target completeness is established separately by the read-only SQL
export in R2 (`supabase-backups/db-export/`, SHA-256 + size verified, 135
tables) and by `scripts/verify_e2e_sync.py --live`.

The mirror is read-oriented: like the core sync, it performs no destructive
DDL. Any discrepancy it reports is a signal to re-run the incremental sync, not
a reason to delete target data.

## Why true Supabase Realtime (WebSockets) is unavailable

Both source projects have their data plane (REST / Storage / Auth / Realtime)
blocked with **HTTP 402** (`exceed_storage_size_quota` plus unpaid invoices).
The only working read path is the Supabase Management API read-only SQL
endpoint, which is what the sync and mirror use. Because Realtime/WebSocket
subscriptions cannot be established on these projects, true push-based
Supabase Realtime is **not available**.

"Realtime" in this runbook therefore means best-effort **polling**: a local
watcher that polls roughly every 60 seconds and a health workflow that checks
its heartbeat every 5 minutes. This is change *detection*, not a websocket
stream. Do not treat it as a guarantee of sub-second freshness. The 402
restriction still requires owner payment or support action; nothing here
attempts a payment or changes credentials.

## The four-layer schedule

| Layer | Cadence | Driver | What it does |
| --- | --- | --- | --- |
| 1 — Local near-realtime watcher | every ~60 s (local); health check every 5 min in CI | `scripts/supabase_realtime_watcher.py` (`--interval 60`); `.github/workflows/supabase-watcher-health.yml` (`*/5 * * * *`) | Polls the source for recent changes and writes a heartbeat/health file so a stalled watcher is visible. |
| 2 — Incremental CI sync | every 15 min | `.github/workflows/supabase-databricks-sync.yml` (`*/15 * * * *`) | Watermark-based MERGE/append into the Databricks target tables using `config/supabase/table_registry.json`. Authoritative data movement. |
| 3 — Shadow refresh + verify | every 30 min | `.github/workflows/databricks-shadow-mirror.yml` (`*/30 * * * *`), `scripts/databricks_shadow_mirror.py` | Rebuilds the Databricks-side shadow from the current target tables, then verifies mirror vs. target and reports snapshot drift. |
| 4 — Backup retention janitor | daily 03:00 UTC | `.github/workflows/supabase-backup-janitor.yml` (`0 3 * * *`) | Prunes expired backup sets, gated on a verified R2 DB-export manifest. Housekeeping only; never touches sync targets. |

Rationale: layer 1 notices changes quickly but is only a local detector; layer 2
is the authoritative (idempotent, upsert-only) data movement; layer 3 provides
an independent reference and catches drift between layers 1/2; layer 4 keeps
retention bounded. Each layer is independently re-runnable.

## Running each script manually

Set credential **key names** in the environment (e.g. `SUPABASE_PAT`,
`DATABRICKS_HOST`, `DATABRICKS_TOKEN`, and for retention `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_S3_ENDPOINT`, `R2_BUCKET`). Never paste values into
a runbook, issue, commit, or chat. See `docs/E2E_CREDENTIALS.md` for the list of
keys that exist and where they are stored.

### Near-realtime watcher

```bash
# one polling cycle and exit (good for a smoke test / recovery re-run)
python3 scripts/supabase_realtime_watcher.py --once

# run continuously, polling every 60 seconds (override with --interval SEC)
python3 scripts/supabase_realtime_watcher.py --interval 60

# bounded run: stop after N cycles (useful for a controlled capture)
python3 scripts/supabase_realtime_watcher.py --interval 60 --max-cycles 10

# write the heartbeat/health file to a specific path
python3 scripts/supabase_realtime_watcher.py --once --health /path/to/watcher-health.json
```

Flags: `--once`, `--interval SEC`, `--max-cycles N`, `--health PATH`.

### Shadow mirror

```bash
# one refresh cycle (default one-shot behaviour)
python3 scripts/databricks_shadow_mirror.py --once

# fetch and print what would be written, without writing anything
python3 scripts/databricks_shadow_mirror.py --dry-run

# verify the mirror against the incremental target and report drift
python3 scripts/databricks_shadow_mirror.py --verify

# restrict the operation to a single source table
python3 scripts/databricks_shadow_mirror.py --table NAME
```

Flags: `--once`, `--dry-run`, `--verify`, `--table NAME` (repeatable to select
several tables). Use `--dry-run` first when changing the registry or mirror
configuration.

### Offline verifier

```bash
# offline: compare committed/state artifacts without touching remote systems
python3 scripts/verify_e2e_sync.py

# live: additionally re-check remote state (requires credentials)
python3 scripts/verify_e2e_sync.py --live
```

The verifier is safe to run anywhere and is the first thing to run when a sync
or mirror run looks wrong. Add `--live` only when you want a fresh remote read.

### Core sync and janitor (existing)

```bash
python3 scripts/supabase_databricks_sync.py --once \
  --registry config/supabase/table_registry.json \
  --state .sync_state/sync_state.json

python3 scripts/supabase_backup_janitor.py            # default: dry-run
python3 scripts/supabase_backup_janitor.py --apply    # actually delete expired sets
```

Manual janitor runs default to dry-run; scheduled runs apply retention.

## Health and state file locations

| Artifact | Location | Notes |
| --- | --- | --- |
| Watcher health/heartbeat | Path supplied via `--health PATH` to `supabase_realtime_watcher.py`; the CI health workflow writes to its configured path (a workspace-relative health directory). | Check this file's timestamp/contents to see whether the watcher is still alive. Confirm the exact path in `.github/workflows/supabase-watcher-health.yml`. |
| Incremental sync watermarks | CI: `.sync_state/sync_state.json`, persisted via the Actions cache (`supabase-sync-state-…`). Local default: `/data/home/workspace/supabase-export/sync_state.json` (also configurable with `--state`). | Watermarks advance only after all statements for a table succeed, so a failed run leaves the watermark safe to reuse. |
| Registry | `config/supabase/table_registry.json` (committed). | 135 tables with per-table Databricks targets and primary-key hints. |
| Shadow mirror | Databricks-side mirror tables in catalog `open_connect`, plus the JSON status line emitted by `databricks_shadow_mirror.py` (which marks skipped tables as `skipped_complex_schema`). | Refresh and verify are separate; `--verify` reports drift rather than mutating target tables. |
| Verifier output | stdout from `scripts/verify_e2e_sync.py`. | Offline by default; `--live` adds a fresh remote read. |
| Backup sets / manifest | R2 bucket under `db-export/<project_ref>/` with a SHA-256-verified manifest; janitor reads the same R2 artifacts. | Deletion is gated on a verified manifest and a valid slash-delimited set id. |

Credential **values** are never written to these files. State and health files
contain watermarks/timestamps/status only.

## Failure recovery

1. **Watcher looks stale or stopped** — check the health file timestamp. Re-run
   `python3 scripts/supabase_realtime_watcher.py --once` for a single cycle, or
   restart the continuous loop with `--interval 60`. Then confirm the health
   workflow `supabase-watcher-health.yml` is green in the Actions tab.
2. **Incremental sync failed or fell behind** — open the Actions run for
   `supabase-databricks-sync.yml` and read the failing step. Watermarks only
   advance on full success, so simply **re-run the job** (or `--once` locally);
   MERGE/append makes retries idempotent. There is no DELETE/DROP/TRUNCATE to
   roll back.
3. **Shadow mirror drift reported** — run
   `python3 scripts/databricks_shadow_mirror.py --dry-run` to inspect, then
   `--verify` to see which tables differ. Re-run the layer 2 sync to catch the
   target up, then refresh the mirror (`--once`) and verify again.
4. **Verifier mismatch** — run `scripts/verify_e2e_sync.py` offline first to
   locate the mismatch, then `--live` to check whether the remote state has
   since caught up. Investigate the corresponding layer (sync vs. mirror) before
   changing the registry.
5. **Janitor concern** — manual runs are dry-run by default; check that the R2
   export gate/manifest is present before using `--apply`. Scheduled
   `supabase-backup-janitor.yml` runs apply retention; a failed run can be
   re-run safely.
6. **HTTP 402 / quota errors** — expected on the data-plane/Realtime paths.
   They are an owner payment/support issue, not a sync bug. Do not attempt a
   payment or revoke credentials; continue using the read-only Management API
   path.

All retries are safe because sync writes are MERGE or deduplicated INSERT only.

## Intentionally skipped complex-schema tables (5)

Five tables are intentionally skipped by the incremental job. Their source
columns contain very large nested `STRUCT` / `ARRAY` / `MAP` types whose
`DESCRIBE` output is truncated (`"... N more fields"`). Emitting SQL from a
truncated type string would fail with a `STRING -> STRUCT` cast error or produce
invalid column definitions, so the sync records these tables with status
`skipped_complex_schema` and moves on.

- The exact tables are determined at runtime by the truncation check in
  `scripts/supabase_databricks_sync.py`; they are not hard-coded. To see the
  current list, inspect the sync run output / state for
  `skipped_complex_schema` entries, or use
  `scripts/verify_e2e_sync.py` (`--live` for a fresh check). The count observed
  at validation time was **5**.
- Their full data is **not lost**: it remains in the initial Databricks
  migration and in the R2 full-DB export (`db-export/<project_ref>/`), and is
  represented in the shadow mirror reference copy.
- Do not "fix" these by forcing a cast from the truncated type. If they must be
  synced incrementally, obtain the complete schema first (e.g. from the JSONL
  export/manifest) and add an explicit type mapping.
- These five are distinct from the four tables previously fixed during
  validation (`storage.objects`, `platform.workspaces`,
  `open_tgate_tg_chats`, `open_tgate_tg_messages`); those now sync cleanly.

## Related documents

- `docs/SUPABASE_DATABRICKS_E2E.md` — core setup, layout, safety properties, validation.
- `docs/E2E_CREDENTIALS.md` — credential key names and storage convention (no values).
