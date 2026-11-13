# Backup — Open-Connect (Railway)

## Backup inventory (responsible parties)

| Data | Backup mechanism | Retention / RPO | Owner |
|------|------------------|-----------------|-------|
| Supabase (DB, Auth, Storage) | Supabase managed backups | daily; RPO per Supabase plan | platform-owner |
| Credential vault (`vault://`) | Open-Connect vault backup | per vault policy | vault-owner |
| Railway secrets (sealed vars) | Railway service config snapshot + IaC in Git | versioned | platform-owner |
| Control-plane image | Docker registry (immutable digest) | versioned | platform-owner |
| Deployment record | `docs/DEPLOYMENT_RECORD.md` in Git | versioned | platform-owner |

## Pre-high-risk-change backup

Before promoting to production or rotating any sealed variable:

1. Confirm the **previous known-good deployment SHA** is recorded in
   `docs/DEPLOYMENT_RECORD.md`.
2. Confirm the Vault snapshot is current (vault backup).
3. Confirm Supabase `open_connect` migration state is recorded.

## Restore review

Restore changes mounted volume state. Prefer safe validation; understand that a
restore rewrites the mounted state. Never wipe a volume as a cleanup shortcut
(none exist here).

## Continuous backup verification

- Supabase backup is active and recent.
- Vault snapshot successful.
- Deployment record is current in Git.
- Image digest referenced in `docs/DEPLOYMENT_RECORD.md` is present in the registry.
