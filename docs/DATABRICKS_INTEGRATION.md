# Databricks governed analytics mirror

Supabase remains the Open-Connect operational source of truth. Databricks receives an hourly,
server-to-server Delta Lake mirror for analytics and data-science workloads.

## Mirrored datasets

| Delta table       | Classification |  Retention | Identity handling                       |
| ----------------- | -------------- | ---------: | --------------------------------------- |
| `memory_records`  | Sensitive      |   365 days | `user_id` becomes keyed HMAC `user_key` |
| `knowledge_items` | Sensitive      |   365 days | `user_id` becomes keyed HMAC `user_key` |
| `resources`       | Internal       | 1,825 days | No user identifier                      |

Raw provider tokens, credential values, OAuth refresh tokens, API keys, passwords, and Supabase
service-role keys are never mirrored.

## Required server secrets

- `DATABRICKS_HOST`
- `DATABRICKS_TOKEN`
- `DATABRICKS_WAREHOUSE_ID`
- `DATABRICKS_SYNC_SECRET`
- `DATABRICKS_PSEUDONYMIZATION_KEY`

Optional non-secret identifiers are `DATABRICKS_CATALOG` (default `open_connect`) and
`DATABRICKS_SCHEMA` (default `production`). Configure the Databricks values in the Cloudflare
production secret store and configure only `DATABRICKS_SYNC_SECRET` in GitHub Actions.

## Authentication and automation

`GET /api/v1/databricks` exposes only whether server configuration exists. It never calls
Databricks or returns workspace identifiers. The hourly workflow invokes `POST` with the independent
sync secret. The browser cannot access the Databricks token.

Google sign-in is an operator bootstrap step in the Databricks account. Complete it through the
normal OAuth UI, then create a least-privilege service principal or OAuth machine-to-machine token
for production automation. Do not automate production using a personal Google session.

## Data lifecycle

- Unity Catalog/Delta table properties record classification, retention, and source.
- The synchronization is an upsert mirror; source deletions require an audited deletion job before
  the configured retention window expires.
- Run deletion discovery in dry-run mode before executing GDPR/CCPA erasure.
- Restrict sensitive tables to the Open-Connect sync principal and approved data-science readers.
- Apply column masks to `title`, `content`, and `source_url` before granting broader analyst access.

## Validation

1. `GET /api/v1/databricks` returns `configured: true` after provider secrets are installed.
2. Trigger **Databricks governed data sync** manually.
3. Confirm the workflow returns `ok: true` without printing credentials.
4. Verify the three Delta tables, properties, row counts, pseudonymized identities, and latest
   `synced_at` values in Unity Catalog.
5. Confirm unauthorized `POST` returns HTTP 401.
