# Databricks mirror 24/7 hardening — notes

Diagnostic companion to the `databricks-sync.yml` hardening PR.

## Why

The scheduled Databricks sync (POST https://open-connect.site/api/v1/databricks) silently
stalled after 2026-11-15T21:53Z: the mirror went stale for ~30 hours with no tracking issue,
because a failed run only produced a red X in the Actions tab.

## What the PR changes

- Cadence: hourly → every 15 minutes (`*/15 * * * *`), keeping `workflow_dispatch`.
- Transient-failure retries: up to 3 attempts, 60s apart, but only for
  `source_export_or_upstream_failure` (HTTP 502) and `transport_failure` (HTTP 000).
  Configuration-class failures (401/403 secret mismatch, 503 runtime not configured) fail fast.
- Outage watchdog: on failure, files or updates a `[sync] Databricks mirror outage` issue
  (via `gh` + the workflow-scoped `GITHUB_TOKEN`, `permissions: issues: write`);
  on the next successful run the issue is closed automatically with a recovery comment.

## Rollback

Revert the workflow commit.
