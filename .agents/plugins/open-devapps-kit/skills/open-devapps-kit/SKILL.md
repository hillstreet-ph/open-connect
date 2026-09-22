---
name: open-devapps-kit
description: Coordinate GitHub, Docker Hub, Cloudflare, Supabase, Sentry, Zeabur, and Databricks as one verified application delivery toolkit. Use for cross-provider setup, audits, releases, incident repair, environment alignment, marketplace packaging, and end-to-end deployment.
---

# Open DevApps Kit

Route provider work to the primary `open-github-kit`, `open-dockerhub-kit`, `open-cloudflare-kit`, `open-supabase-kit`, `open-sentry-kit`, `open-zeabur-kit`, and `open-databricks-kit`. Do not duplicate connectors or credentials.

## Delivery flow

1. Inventory accounts, projects, environments, connections, and ownership without reading secret values.
2. Build one environment contract listing variable names, owners, consumers, and secret locations.
3. Assign ownership: GitHub source/review; Docker Hub images; Cloudflare edge/DNS; Supabase data/Auth; Zeabur server runtime; Sentry telemetry; Databricks governed analytics/AI.
4. Deduplicate only identical-purpose connections. Preserve admin/client and production/staging separation when documented.
5. Implement through protected CI and promote one reviewed commit or immutable digest.
6. Verify each provider, then test public flow, authentication, API, data, telemetry, and rollback end to end.

## Access and completion

“Full read/write” means requested operations allowed by provider scopes. Require confirmation before destructive, production, security, permission, billing, DNS, secret, or data-changing actions. Never embed credentials in skills, plugins, ZIPs, source, logs, or marketplace records. Record each dependency as `VERIFIED`, `PARTIALLY_VERIFIED`, `BLOCKED`, or `NOT_APPLICABLE`; overall completion cannot exceed the weakest required dependency.
