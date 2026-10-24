---
name: gh-cf-sb-zb-setup
description: Production E2E orchestrator for GitHub source/fork governance, Supabase database/Auth/RLS/Storage/backend services, Zeabur application runtime/services/workers/persistence, and Cloudflare DNS/TLS/WAF/edge. Docker Hub and Railway are excluded.
when-to-use: Use when a project requires GitHub + Supabase + Zeabur + Cloudflare and should deploy to Zeabur without requiring Docker Hub.
---

# gh-cf-sb-zb-setup

Coordinate:
- `github-e2e-setup`
- `supabase-e2e-setup`
- `zeabur-e2e-setup`
- `cloudflare-e2e-setup`

## Strict profile

REQUIRED:
- GitHub
- Supabase
- Zeabur
- Cloudflare

NOT_REQUIRED:
- Docker Hub
- Railway

Do not silently introduce excluded providers.

## Target topology

USER → CLOUDFLARE → ZEABUR → SUPABASE

GitHub owns source/release governance.
Zeabur owns application execution.
Supabase owns database/Auth/RLS/Storage/backend data services.
Cloudflare owns public DNS/TLS/proxy/WAF/edge.

Cloudflare Pages/Workers are used only when intentionally required.

## Docker Hub exclusion

A Dockerfile may exist without requiring Docker Hub. Prefer a supported Zeabur source/native build path from the controlled GitHub repository when compatible.

Do not create a Docker Hub repository merely because a Dockerfile exists.

If an immutable external registry artifact is explicitly required, this profile must be reclassified to `gh-dh-cf-sb-zb-setup`.

## One-owner rule

Assign exactly one authoritative owner per responsibility.

Database → normally Supabase.
Application runtime → Zeabur.
Public DNS/edge → Cloudflare.
Source/release → GitHub.
Scheduler → one owner per logical job.
Persistent files → deliberately Supabase Storage or Zeabur volume.

Do not create duplicate databases, runtimes, schedulers, DNS ownership, or authoritative persistent stores without explicit architecture.

## Lifecycle

DETECT → DISCOVER → AUDIT → CLASSIFY → PRESERVE → BACKUP CHECK → ARCHITECT → MAP DEPENDENCIES → PLAN → GITHUB → SUPABASE → ZEABUR → CLOUDFLARE → SECURITY → CI → STAGING → INTEGRATION/E2E → PRODUCTION GATE → PRODUCTION → VERIFY → MONITOR → BACKUP → ROLLBACK → RECOVERY → DOCUMENT → MAINTAIN.

## Startup modes

NEW
SOURCE_IMPORT
CLONE
FORK
EXISTING_REPOSITORY
EXISTING_PRODUCTION
MIGRATION
RECOVERY

Never assume NEW.

## Read before write

Discover GitHub repository/fork/upstream/branches/PRs/workflows/releases/security.

Discover Supabase project/schema/tables/migrations/Auth/OAuth/RLS/Storage/APIs/Functions/jobs/vector/Vault/backups.

Discover Zeabur projects/environments/services/source/build/variables/domains/ports/health/networking/volumes/workers/jobs/deployments/logs.

Discover Cloudflare account/zone/DNS/DNSSEC/TLS/proxy/Pages/Workers/routes/domains/WAF/rate limits/cache/redirects.

Do not create equivalent resources before understanding existing state.

## Existing production safety

Preserve existing production and data first.

Never blindly:
- force-push/reset main
- recreate repository/project/service
- drop/truncate production data
- delete users
- disable RLS
- make private Storage public
- delete Storage
- delete/recreate Zeabur volume
- replace production variables blindly
- replace DNS/domain
- weaken TLS.

High-risk:
DISCOVER → IMPACT → VERIFY BACKUP/RECOVERY → DEFINE ROLLBACK → STAGING → APPROVAL → APPLY → VERIFY.

## Secrets

Never fabricate, print, commit, document, or expose secret values.
Privileged Supabase credentials remain trusted/server-side.
Reports contain NAME/OWNER/ENVIRONMENT/CONSUMER/STATUS only.

## Idempotency

DISCOVER → COMPARE → PLAN → APPLY MINIMAL DIFFERENCE → VERIFY.

Prevent duplicate repositories, branches, workflows, Supabase projects/tables/policies/buckets/functions/jobs, Zeabur projects/services/volumes/domains, and Cloudflare records/Pages/Workers/routes.

## GitHub

Invoke `github-e2e-setup`.

Fork mode:
UPSTREAM = original.
ORIGIN = controlled fork.

Preserve history/license/notices.

Recommended:
main
development
staging
feature/*
fix/*
hotfix/*
release/*
ai-fix/*
dependabot/*
upstream-sync/*

Never upstream → main directly.

Use:
upstream/default → upstream-sync/<version-or-sha> → compatibility review → CI/security → development → staging → Zeabur staging → E2E → release PR → main → production.

Maintain `docs/FORK_CUSTOMIZATIONS.md`.

CI may include applicable format/lint/typecheck/unit/integration/build/secret scan/dependency scan/SAST/migration validation/RLS tests/deployment validation/E2E.

Use least privilege and protected production environments.

## Supabase

Invoke `supabase-e2e-setup`.

Model DB entities/PK/FK/constraints/indexes/timestamps/ownership/RLS deliberately.

Durable changes:
MIGRATION → VALIDATE → DEVELOPMENT → STAGING → TEST → BACKUP CHECK → APPROVAL → PRODUCTION → VERIFY.

Treat DROP/TRUNCATE/large destructive changes as high risk.

Verify Auth/OAuth/session/recovery as applicable.

Authentication != authorization.

RLS is a primary authorization boundary. Test anonymous, user A, user B, admin and privileged server identities where applicable. User A must not access user B private data unless authorized.

Never disable RLS to solve failures.

Classify Storage PUBLIC/PRIVATE. Sensitive/user data normally private. Verify upload/download/list/update/delete/authorization.

Storage migration:
INVENTORY → COPY → VERIFY SIZE/CHECKSUM → VERIFY METADATA/REFERENCES → CUTOVER → PRESERVE SOURCE.

Use Functions/jobs/vector only when required.

Verify DB backup/PITR and separate Storage recovery.

## Zeabur

Invoke `zeabur-e2e-setup`.

Prefer deployment from controlled GitHub source.

Record repository/branch-or-tag/Git SHA/deployment identifier.

Detect actual framework/language/package manager/root/build/start commands/runtime requirements. Do not invent commands when repository configuration defines them.

Determine justified service architecture:
WEB
API
WORKER
SCHEDULER

Do not split services unnecessarily.

Ensure application port = Zeabur service port = health target = routing expectation.

Use runtime-compatible bind interface.

Health must represent meaningful readiness.

Runtime variable contract:
NAME
PURPOSE
SENSITIVE?
REQUIRED?
OWNER
ENVIRONMENT
STATUS

Never document values.

Classify runtime paths:
EPHEMERAL
CACHE
TEMPORARY
PERSISTENT

Persistent state must not live only on disposable filesystem.

Assign persistent dataset to:
SUPABASE DATABASE
SUPABASE STORAGE
ZEABUR VOLUME

with one authoritative owner.

Never delete/recreate a production volume as a troubleshooting shortcut.

Where safe, persistence verification:
WRITE TEST → VERIFY → RESTART/REDEPLOY → VERIFY AGAIN.

Separate long-running workers when justified.

Assign exactly one scheduler per logical production job.

Prefer private/internal service networking where appropriate. Expose only required services publicly.

## Staging

Use representative staging without unnecessary production data.

Validate:
same release candidate
compatible architecture/variables/schema
ports
health
workers/jobs
persistence
Supabase connectivity
Cloudflare route
security
E2E.

## Cloudflare

Invoke `cloudflare-e2e-setup`.

Preferred:
USER → CLOUDFLARE → ZEABUR ORIGIN.

Cloudflare owns public edge; Zeabur owns runtime.

Use Pages only if a separate frontend requires it.
Use Workers only for intentional edge functionality.
Do not duplicate the Zeabur backend without architectural reason.

Before production DNS cutover verify Zeabur origin:
deployment
process
port
health
application response
Supabase connectivity.

Record DNS change:
TYPE
NAME
OLD TARGET
NEW TARGET
PROXY
TTL
ROLLBACK TARGET.

Use secure end-to-end TLS.
Do not weaken TLS to hide origin failures.

WAF/rate limits must not break legitimate OAuth callbacks, APIs, webhooks, health checks or application traffic.

Never cache authenticated/private/user-specific responses or tokens.

Verify Cloudflare → Zeabur DNS/proxy/TLS/routing and WebSocket behavior when required.

## Production gate

Require applicable:
SOURCE_VERIFIED
CI_PASSED
SECURITY_PASSED
MIGRATIONS_VERIFIED
AUTH_VERIFIED
RLS_VERIFIED
STORAGE_VERIFIED
ZEABUR_STAGING_DEPLOYED
ZEABUR_STAGING_VERIFIED
WORKERS_VERIFIED
PERSISTENCE_VERIFIED
CLOUDFLARE_STAGING_VERIFIED
BACKUP_READY
ROLLBACK_READY
APPROVED.

## Release identity

APP VERSION ↔ GIT SHA ↔ SUPABASE MIGRATION VERSION ↔ ZEABUR DEPLOYMENT ↔ CLOUDFLARE CONFIG/ROUTE ↔ TIMESTAMP.

## Production

Preferred:
VALIDATED GIT RELEASE → AUTHORIZED DB MIGRATION → ZEABUR PRODUCTION → HEALTH VERIFY → SUPABASE CONNECTIVITY → CLOUDFLARE CUTOVER → PRODUCTION E2E.

Verify applicable:
GitHub release
Zeabur deployment/process/port/health/workers/jobs/persistence
Cloudflare DNS/TLS/proxy
frontend/API
Supabase DB/Auth/OAuth/RLS/Storage/Functions
critical integrations.

Successful Zeabur build alone is not completion.

## Status

PLANNED
CONFIGURED
CI_PASSED
STAGING_DEPLOYED
STAGING_VERIFIED
APPROVED
PRODUCTION_DEPLOYED
PRODUCTION_VERIFIED

Only PRODUCTION_VERIFIED means completion.

Global:
VERIFIED
PARTIALLY_VERIFIED
BLOCKED
FAILED
PROFILE_INCOMPATIBLE.

## Observability

Monitor applicable application availability/latency/errors, Zeabur deployment/resources/storage/workers/jobs, Supabase DB/Auth/Functions and Cloudflare edge.

Never log secrets.

## Backup

Treat separately:
GITHUB SOURCE
SUPABASE DATABASE
SUPABASE STORAGE
ZEABUR VOLUMES
ZEABUR CONFIGURATION
CLOUDFLARE CONFIGURATION

One backup does not cover all layers.

For each persistent volume define criticality, backup method, frequency, retention, restore target and restore validation.

## Rollback

Before production record:
previous Git SHA
previous Zeabur deployment
previous critical runtime config
previous Cloudflare DNS target
previous Cloudflare route/config
Supabase migration state.

Failure:
FREEZE → DIAGNOSE → CHECK DB COMPATIBILITY → KNOWN-GOOD RELEASE → ZEABUR ROLLBACK/REDEPLOY → HEALTH → E2E.

Application rollback does not automatically reverse DB migrations or restore volume data.

Treat CODE, CONFIG, DATABASE and FILES separately.

## Disaster recovery

Reconstruct from:
GITHUB SOURCE
+ SUPABASE DB BACKUP
+ SUPABASE STORAGE RECOVERY
+ ZEABUR CONFIG
+ ZEABUR VOLUME BACKUP
+ CLOUDFLARE CONFIG
+ SECRET INVENTORY.

Typical recovery:
GITHUB → SUPABASE DB → STORAGE → ZEABUR PROJECT/SERVICES → VARIABLES → VOLUMES → DEPLOY → HEALTH → CLOUDFLARE → E2E.

## AI diagnosis

Return:
FAILURE
PROVIDER
LAYER
ROOT_CAUSE
EVIDENCE
CONFIDENCE
RISK
PROPOSED_FIX
DATA_IMPACT
SECURITY_IMPACT
ROLLBACK_PLAN
VALIDATION_PLAN.

Failure taxonomy:
SOURCE_FAILURE
CI_FAILURE
BUILD_FAILURE
DATABASE_FAILURE
MIGRATION_FAILURE
AUTH_FAILURE
OAUTH_FAILURE
RLS_FAILURE
STORAGE_FAILURE
FUNCTION_FAILURE
ZEABUR_BUILD_FAILURE
ZEABUR_RUNTIME_FAILURE
PORT_FAILURE
HEALTH_FAILURE
WORKER_FAILURE
JOB_FAILURE
PERSISTENCE_FAILURE
NETWORK_FAILURE
DNS_FAILURE
TLS_FAILURE
EDGE_FAILURE
E2E_FAILURE.

Repair only owning layer.

Maximum 3 automated repair cycles per failure:
DIAGNOSE → PATCH → CI → STAGING → VERIFY.

Then STOP, preserve evidence and report blocker.

Never weaken RLS/Auth/TLS/data isolation or expose credentials to pass tests.

## Documentation

Maintain applicable:
docs/ARCHITECTURE.md
docs/PROVIDER_OWNERSHIP.md
docs/GITHUB.md
docs/FORK.md
docs/FORK_CUSTOMIZATIONS.md
docs/UPSTREAM_SYNC.md
docs/SUPABASE.md
docs/ZEABUR.md
docs/ZEABUR_ARCHITECTURE.md
docs/ZEABUR_DEPLOYMENT.md
docs/ZEABUR_VARIABLES.md
docs/ZEABUR_NETWORKING.md
docs/ZEABUR_PERSISTENCE.md
docs/CLOUDFLARE.md
docs/CI-CD.md
docs/DEPLOYMENT.md
docs/SECURITY.md
docs/BACKUP.md
docs/ROLLBACK.md
docs/RECOVERY.md
docs/RUNBOOK.md

Never include secret values.

## Provider ownership

GITHUB = REQUIRED
SUPABASE = REQUIRED
ZEABUR = REQUIRED
CLOUDFLARE = REQUIRED
DOCKER_HUB = NOT_REQUIRED
RAILWAY = NOT_REQUIRED

## Evidence

Every success claim requires evidence.

GitHub → checks/workflows/releases.
Supabase → migration/Auth/RLS/Storage tests.
Zeabur → deployment/process/port/health/application/persistence.
Cloudflare → DNS/TLS/proxy/route.

Never infer success.

## Completion

Require applicable:
SOURCE_VERIFIED
+ FORK/UPSTREAM_VERIFIED
+ CI_VERIFIED
+ SECURITY_VERIFIED
+ DATABASE_VERIFIED
+ AUTH_VERIFIED
+ RLS_VERIFIED
+ STORAGE_VERIFIED
+ ZEABUR_STAGING_VERIFIED
+ ZEABUR_RUNTIME_VERIFIED
+ WORKERS_VERIFIED
+ PERSISTENCE_VERIFIED
+ CLOUDFLARE_VERIFIED
+ PRODUCTION_E2E_VERIFIED
+ MONITORING_DEFINED
+ BACKUP_VERIFIED
+ ROLLBACK_READY
+ RECOVERY_DOCUMENTED.

Only then GLOBAL_STATUS = VERIFIED.

## Execution order

1. Detect source/application.
2. Confirm profile.
3. Discover GitHub/Supabase/Zeabur/Cloudflare.
4. Classify startup mode.
5. Inventory existing production/data/config/runtime.
6. Verify recovery before risky operations.
7. Build dependency/ownership map.
8. Invoke github-e2e-setup.
9. Establish fork/upstream/branches/CI/security/release.
10. Invoke supabase-e2e-setup.
11. Validate schema/migrations/Auth/OAuth/RLS/Storage/backend services.
12. Verify DB/Storage recovery.
13. Invoke zeabur-e2e-setup.
14. Reuse/create justified project/environment/services.
15. Configure GitHub source deployment/build/start/variables/networking/ports/health/persistence/workers/jobs.
16. Deploy and verify staging.
17. Run migration/Auth/RLS/Storage/worker/job/persistence tests.
18. Invoke cloudflare-e2e-setup.
19. Verify Zeabur origin before edge routing.
20. Configure/test staging DNS/TLS/proxy.
21. Run integration/security/E2E.
22. Verify backup/rollback readiness.
23. Evaluate production gate.
24. Apply authorized migrations.
25. Deploy validated Git release to Zeabur production.
26. Verify runtime and Supabase connectivity.
27. Perform controlled Cloudflare production cutover.
28. Verify DNS/TLS/proxy/application/Auth/RLS/Storage/workers/persistence.
29. Run production E2E.
30. Establish monitoring.
31. Verify database/Storage/volume recovery.
32. Establish rollback.
33. Configure safe upstream/dependency maintenance.
34. Audit duplicates/security.
35. Produce evidence-backed final report.
