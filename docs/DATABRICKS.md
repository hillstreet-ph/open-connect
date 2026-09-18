# Databricks data plane

Supabase remains Open-Connect's transactional source of truth. Databricks is a governed Delta
Lake mirror for analytics, memory/knowledge quality work, retrieval evaluation, and reporting.

## Mirrored domains

- `memory_records`: private content with `user_id` replaced by an HMAC-derived `user_key`.
- `knowledge_items`: private content with the same pseudonymous identity boundary.
- `resources`: non-secret marketplace and resource-catalog metadata.

Credentials, API keys, OAuth tokens, credential metadata, and Supabase auth tables are explicitly
excluded. The first authenticated sync creates the schema and Delta tables, then applies
classification and retention table properties.

## Required server bindings

- `DATABRICKS_HOST`
- `DATABRICKS_TOKEN`
- `DATABRICKS_WAREHOUSE_ID`
- `DATABRICKS_SYNC_SECRET`
- `DATABRICKS_PSEUDONYMIZATION_KEY`

Optional: `DATABRICKS_CATALOG` (default `open_connect`) and `DATABRICKS_SCHEMA` (default
`production`). Store values in the deployment provider's secret manager. Never expose them as
`VITE_` variables.

## Operation

`GET /api/v1/databricks` reports only configuration presence and the source-of-truth name without
contacting the warehouse or exposing workspace identifiers.
`POST /api/v1/databricks` requires `Authorization: Bearer <DATABRICKS_SYNC_SECRET>`, bootstraps
the lakehouse, and upserts bounded batches from the approved Supabase allowlist.

The hourly GitHub workflow calls the sync endpoint only when its repository secret is configured.
For initial activation, run the workflow manually and verify row counts and table properties in
Unity Catalog before relying on the schedule.

## Governance

- Private identity values are pseudonymized before egress.
- Tables are tagged through Delta table properties with classification and retention periods.
- The sync is idempotent by source UUID.
- Deletion propagation and retention enforcement must be enabled in Databricks before treating the
  mirror as a compliant long-term store.
