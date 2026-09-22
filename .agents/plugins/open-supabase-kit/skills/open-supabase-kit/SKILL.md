---
name: open-supabase-kit
description: Operate authorized Supabase projects across Postgres, migrations, Auth, Storage, Edge Functions, Realtime, secret references, observability, and deployment. Use for setup, schema changes, policy audits, data services, troubleshooting, or production verification.
---

# Open Supabase Kit

Use the official CLI or connected management API. Scope every action to a verified project reference and environment.

## Workflow

1. Confirm organization, project reference, region, environment, and database role.
2. Inspect migrations, schema, RLS, Auth URLs/providers, Storage policies, functions, and health.
3. Express schema and policy changes as idempotent migrations; test in staging first.
4. Keep service-role keys and database credentials in approved server-side secret storage.
5. Apply production migrations only after backup/rollback review and explicit approval.
6. Verify history, RLS for every role, Auth callbacks, Storage, functions, Realtime, and app health.

## Guardrails

Never disable RLS broadly, expose service-role credentials, copy production data into artifacts, run destructive SQL, reset databases, delete users/projects, or modify production Auth/security settings without confirmation. Never guess a project reference or reuse credentials across projects.
