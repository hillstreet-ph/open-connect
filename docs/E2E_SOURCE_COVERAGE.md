# E2E source coverage (2026-11-17)

## Live 24/7 syncs (verified)

| Source | Target | Schedule | Status |
| --- | --- | --- | --- |
| Supabase (2 projects, 135 tables) | Databricks `open_connect` 8 product schemas | `*/15 * * * *` | 133 tables ok; 5 complex-schema skips; 2 large tables rerun OK |
| Databricks target snapshots | `open_connect.shadow` | `*/30 * * * *` | 135 mirrored / 135 verified, 0 mismatches |
| Supabase backup janitor | R2 + Supabase storage | `0 3 * * *` | R2 manifest gate, lifecycle-only deletion |
| Supabase watcher health | Health check | `*/5 * * * *` | live `--once` verified |
| GitHub `hillstreet-ph` org (26 repos) | Databricks governed project registry (`schema_name='github_org'`) | `*/15 * * * *` | 26 rows upserted, 0 new tables (metastore at 521/500 quota) |

GitHub inventory rows are merged on a deterministic UUID (`id`) with
`schema_name='github_org'`, so rescheduling is idempotent and the 6
Supabase-origin registry rows remain untouched (32 rows total, 26 GitHub).

## Connected but not yet ingested into Databricks

Notion, Airtable, Linear, Sentry, Cloudflare, Railway, Vercel, PostHog,
Todoist, Canva (hosted connectors). These require actionable credentials in
GitHub Actions before a scheduled job can read them; no secret values are
stored in this repo.

## Sources with no connector / no authorised account

ChatGPT account data, Claude account data, Teamily, Qoder, Google Drive,
desktop-local agent state. An OpenAI API key and a CLAWHUB token exist as
secrets but they are not consented access to chat history or drive files.
These cannot be synced truthfully until the relevant account/connector is
authorised. No placeholder rows are created for them.
