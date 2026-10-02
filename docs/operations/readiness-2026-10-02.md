# Open-Connect readiness — 2 October 2026

This records evidence, not a claim of complete end-to-end activation.

| Area | Verified evidence | Remaining work |
| --- | --- | --- |
| Sidebar and pages | Requested Work, Discover, Cloud, Connections ordering is deployed | Authenticated workflow checks across every page remain unverified |
| Gateway | Live authenticated status returned 86 published resources and 1 connected service | Validate individual connected-provider actions |
| ChatGPT integration | Current grant: openid, mcp:connect, models:read, models:invoke, resources:read | Additional operations require a supported tool surface and authorized scopes |
| Models | Gateway advertises five aliases | Actual model inference and provider billing/credentials not validated |
| Cloud | Four pages discover/call Custom MCP tools through the authenticated server | Actual devices, provider endpoints, subscriptions, and live execution are not provisioned by these pages |
| Tasks | Server-backed create/list/status functions exist | Authenticated production CRUD round-trip not performed |
| Schedules | Definitions are stored; one-shot form no longer submits cron simultaneously | No dispatcher for these records verified; connect and test a scheduling worker before treating active as executing |
| Automations | Agent/pipeline actions create plans; disabled and unsupported actions now reject | Worker execution and notify/webhook/MCP dispatch remain incomplete |
| Resources/Studio | Installed library and upload paths exist; shared-library/navigation regression suite passes | Production upload/install/remove round-trip not performed |
| Credentials | Existing project assignment remains unchanged | Actual credential use/expiry/2FA flows not validated; do not expose secret values |
| Database | Supabase connector table inventory and read-only inspection returned HTTP 403 | Reauthorize an account with access to project huadtiuuoiriqrjpjxhr; then verify migrations, policies, storage and backups |
| Validation | Build and full test suite passed; lint has 50 existing warnings, zero errors | Standalone TypeScript check has existing schema-related errors; no new diagnostic signatures introduced |

## Repairs in this change

- Reject disabled automations on the server, including direct calls.
- Reject unsupported executors instead of recording a false successful run.
- Check resource lookup and plan/event/capability-request persistence errors.
- Distinguish saved plans from actual execution in the UI.
- Display loading and retryable errors for tasks, schedules, and automations.
- Submit only run-at for a one-shot schedule rather than the default cron as well.

## Completion sequence

1. Restore authorized Supabase project inspection and authenticated application testing.
2. Verify the existing data schema, policies, credential references and rollback/backup setup.
3. Configure cloud provider connections; discover actual tools and perform a reversible live session test per device type.
4. Implement and deploy the scheduling dispatcher and automation executors with execution evidence, retry/idempotency, and failure reporting.
5. Validate one complete create/run/result workflow for every supported action, including denied/expired credentials and provider failures.
6. Authorize needed ChatGPT integration scopes through the normal account flow and verify each exposed action. An installed plugin alone does not grant access.

No secrets were retrieved, printed, rotated, or changed during this audit. No production database writes were performed.
