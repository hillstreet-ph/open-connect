# Cron — Open-Connect control plane

## Summary

The control plane (`control_plane` service) is **not** a cron worker. It is a
long-running HTTP API. Scheduled work is owned by:

- Supabase Edge Functions / cron (where applicable), and
- the application's own workers (E2B/OpenBrowser/browser-worker — scheduled via
  the credential broker, not by Railway).

## Duplicate-scheduler prevention

Before creating any Railway cron job, confirm no equivalent schedule already runs
in Supabase or the application layer (docs/RAILWAY_VARIABLES.md references).

## If a scheduler is ever needed

Document: schedule, timezone, command, owner, dependencies, duration, retry,
idempotency, observability. Default to a persistent Worker service instead of
Railway Cron, and use a bounded, verified schedule.
