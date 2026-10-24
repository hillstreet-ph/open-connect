---
name: gh-cf-sb-setup
description: Production E2E orchestrator for GitHub source/fork governance, Supabase database/Auth/RLS/Storage/backend services, and Cloudflare Pages/Workers/DNS/TLS/WAF/edge. Excludes Docker Hub, Railway and Zeabur.
when-to-use: Use when a project should be created, forked, audited, repaired, secured, deployed, maintained, backed up or recovered using GitHub + Supabase + Cloudflare only.
---

# gh-cf-sb-setup

Coordinate:
- `github-e2e-setup`
- `supabase-e2e-setup`
- `cloudflare-e2e-setup`

as one production lifecycle.

## Strict profile

REQUIRED:
- GitHub
- Supabase
- Cloudflare

NOT_REQUIRED:
- Docker Hub
- Railway
- Zeabur

Do not silently introduce excluded providers.

If the application requires a persistent server/container runtime, unsupported long-running process, persistent local filesystem, or daemon that this architecture cannot safely provide, return `PROFILE_INCOMPATIBLE` and identify the requirement.

## Ownership

GitHub:
source, fork/upstream, branches, PRs, CI, tests, security checks, release governance.

Supabase:
PostgreSQL, schema/migrations, Auth/OAuth, profiles/roles, RLS, Storage, REST/RPC/Realtime, Edge Functions, jobs/vector/Vault and DB recovery where required.

Cloudflare:
Pages/Workers when appropriate, DNS, custom domains, TLS, proxy/CDN, WAF, rate limiting, routing, redirects and cache.

## Lifecycle

DETECT → DISCOVER → AUDIT → CLASSIFY → PRESERVE → BACKUP CHECK → ARCHITECT → PLAN → GITHUB → SUPABASE → CLOUDFLARE → SECURITY → CI → STAGING → E2E → PRODUCTION GATE → PRODUCTION → VERIFY → MONITOR → BACKUP → ROLLBACK → RECOVERY → DOCUMENT → MAINTAIN.

## Startup modes

NEW
SOURCE_IMPORT
CLONE
FORK
EXISTING_REPOSITORY
EXISTING_PRODUCTION
MIGRATION
RECOVERY.

Never assume NEW.

## Read before write

Discover existing GitHub repository/upstream/branches/workflows/releases/security; Supabase project/schema/migrations/Auth/OAuth/RLS/Storage/APIs/Functions/jobs/vector/backups; Cloudflare account/zone/DNS/TLS/Pages/Workers/routes/domains/WAF/cache.

Do not create equivalent resources before understanding existing state.

## Production safety

If production exists, preserve it first.

Never blindly:
- force-push/reset main
- recreate repositories/projects
- drop/truncate production tables
- delete users
- disable RLS
- make private Storage public
- delete buckets/files
- replace OAuth configuration
- recreate Pages/Workers
- replace DNS/domains
- weaken TLS.

High-risk:
DISCOVER → IMPACT → BACKUP/RECOVERY → ROLLBACK → STAGING → APPROVAL → APPLY → VERIFY.

## Secrets

Never fabricate, print, commit, document, or expose secret values.
Never expose privileged Supabase or Cloudflare credentials to browser code.
Reports show secret NAME/OWNER/ENVIRONMENT/STATUS only.

## Idempotency

DISCOVER → COMPARE → PLAN → APPLY MINIMAL DIFFERENCE → VERIFY.

Prevent duplicate repositories, branches, workflows, projects, schemas, tables, indexes, RLS policies, buckets, functions, jobs, Pages projects, Workers, DNS records and domains.

## Fork mode

UPSTREAM = original repository.
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
upstream-sync/*.

Never upstream → main directly.

Preferred:
upstream/default → upstream-sync/<version-or-sha> → compatibility review → CI/security → PR development → staging → E2E → release PR → main → production.

Maintain `docs/FORK_CUSTOMIZATIONS.md`.

## GitHub

Invoke `github-e2e-setup`.

Use applicable:
format, lint, typecheck, unit, integration, build, secret scan, dependency scan, SAST, migration validation, RLS tests, Cloudflare deployment validation and E2E.

Use least privilege, protected branches/environments and review gates.
Never expose production secrets to untrusted PRs.

## Supabase

Invoke `supabase-e2e-setup`.

Discover actual state first.

Design entities/PK/FK/constraints/indexes/timestamps/ownership/RLS deliberately.

Durable schema changes:
MIGRATION → VALIDATE → DEVELOPMENT → STAGING → TEST → BACKUP CHECK → APPROVAL → PRODUCTION → VERIFY.

DROP/TRUNCATE/large destructive changes require stronger safeguards.

Verify Auth/OAuth/session/recovery as applicable.

Authentication != authorization.

RLS is a primary authorization boundary. Test anonymous, user A, user B, admin and privileged server identities where applicable. User A must not access user B private data unless authorized.

Never fix an application by disabling RLS.

Classify Storage PUBLIC/PRIVATE. Sensitive/user data normally private. Verify upload/download/list/update/delete/authorization.

Privileged S3 credentials remain server-side.

Storage migration:
INVENTORY → COPY → VERIFY SIZE/CHECKSUM → VERIFY METADATA/REFERENCES → CUTOVER → PRESERVE SOURCE.

Use Functions/jobs/vector only when required.

One logical scheduled job should normally have one scheduler.

Verify actual database backup/PITR and separate Storage recovery before claiming backup readiness.

## Cloudflare architecture

Invoke `cloudflare-e2e-setup`.

Determine whether application belongs on:
- Pages
- Workers
- supported Pages + Workers architecture.

Do not deploy everything to both automatically.

Typical:
USER → CLOUDFLARE PAGES/WORKERS → SUPABASE.

GitHub provides source and delivery governance.

Do not force persistent/unsupported workloads into Workers.

## Cloudflare + Supabase security

Browser/public code may use only client-safe Supabase configuration.
Privileged credentials remain trusted/server-side.
RLS remains the authorization boundary for client-accessible data.

Classify Cloudflare config:
PUBLIC_BUILD_CONFIG
PUBLIC_RUNTIME_CONFIG
SECRET
BINDING.

Never leak server-only secrets through public build variables.

## Environments

Separate development/staging/production appropriately.

Preview deployments must not receive unrestricted production credentials.

## DNS/TLS/edge

Before production DNS change record:
TYPE
NAME
OLD TARGET
NEW TARGET
PROXY
TTL
ROLLBACK TARGET.

Use secure TLS. Do not weaken TLS to hide origin/application failures.

Configure WAF/rate limiting without breaking legitimate OAuth callbacks, APIs, webhooks or application traffic.

Do not cache authenticated/private/user-specific responses or tokens.

## Staging

Run applicable:
build
Pages/Workers
database/migration
Auth/OAuth
RLS
Storage
API
Functions/jobs
Realtime
security
E2E.

Prefer synthetic/sanitized data.

## Production gate

Require applicable:
SOURCE_VERIFIED
CI_PASSED
SECURITY_PASSED
MIGRATIONS_VERIFIED
AUTH_VERIFIED
RLS_VERIFIED
STORAGE_VERIFIED
STAGING_DEPLOYED
STAGING_VERIFIED
BACKUP_READY
ROLLBACK_READY
APPROVED.

## Release identity

Map:
APP VERSION ↔ GIT SHA ↔ SUPABASE MIGRATION VERSION ↔ CLOUDFLARE DEPLOYMENT ↔ TIMESTAMP.

## Production verification

Verify applicable:
DNS
TLS
Pages
Workers
frontend
API
DB
Auth/OAuth
RLS
Storage
Functions/jobs
Realtime
critical integrations.

Green CI or Cloudflare deployment alone is not completion.

States:
PLANNED
CONFIGURED
CI_PASSED
STAGING_DEPLOYED
STAGING_VERIFIED
APPROVED
PRODUCTION_DEPLOYED
PRODUCTION_VERIFIED.

Only PRODUCTION_VERIFIED means success.

## Monitoring

Define monitoring for applicable application/Cloudflare/Supabase DB/Auth/Functions/jobs/availability/latency/errors.

Never log secrets.

## Backup/recovery

Treat independently:
GITHUB SOURCE
SUPABASE DATABASE
SUPABASE STORAGE
CLOUDFLARE CONFIGURATION.

DB backup does not automatically cover Storage.

System recovery should reconstruct:
GITHUB SOURCE + SUPABASE DB BACKUP + STORAGE RECOVERY + CLOUDFLARE CONFIG + SECRET INVENTORY.

Where feasible validate restore safely outside production.

## Rollback

Before promotion record:
previous Git SHA
previous Cloudflare deployment
previous DNS target
DB migration state.

Failure:
FREEZE → DIAGNOSE → CHECK DB COMPATIBILITY → KNOWN-GOOD → ROLLBACK → VERIFY.

Do not automatically reverse DB migrations because frontend/Worker code rolls back.

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

Classify:
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
WORKER_FAILURE
DNS_FAILURE
TLS_FAILURE
EDGE_FAILURE
E2E_FAILURE.

Repair only the owning layer.

## AI repair

Default max 3 automated cycles per failure:
DIAGNOSE → PATCH → CI → STAGING → VERIFY.

Then stop, preserve evidence and report blocker.

Never weaken security to pass tests.

## Documentation

Maintain applicable:
docs/ARCHITECTURE.md
docs/PROVIDER_OWNERSHIP.md
docs/GITHUB.md
docs/FORK.md
docs/FORK_CUSTOMIZATIONS.md
docs/UPSTREAM_SYNC.md
docs/SUPABASE.md
docs/CLOUDFLARE.md
docs/CI-CD.md
docs/DEPLOYMENT.md
docs/SECURITY.md
docs/BACKUP.md
docs/ROLLBACK.md
docs/RECOVERY.md
docs/RUNBOOK.md.

Provider ownership must explicitly record:
GITHUB = REQUIRED
SUPABASE = REQUIRED
CLOUDFLARE = REQUIRED
DOCKER_HUB = NOT_REQUIRED
RAILWAY = NOT_REQUIRED
ZEABUR = NOT_REQUIRED.

## Evidence

Every success claim requires provider evidence.

GitHub → checks/workflows/releases.
Supabase → migrations/Auth/RLS/Storage tests.
Cloudflare → deployment/DNS/TLS/route/application verification.

Never infer success.

## Global status

VERIFIED
PARTIALLY_VERIFIED
BLOCKED
FAILED
PROFILE_INCOMPATIBLE.

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
+ STAGING_VERIFIED
+ CLOUDFLARE_VERIFIED
+ PRODUCTION_E2E_VERIFIED
+ MONITORING_DEFINED
+ BACKUP_VERIFIED
+ ROLLBACK_READY
+ RECOVERY_DOCUMENTED.

Only then GLOBAL_STATUS = VERIFIED.

## Execution directive

1. Detect application/source.
2. Confirm profile compatibility.
3. Discover GitHub/Supabase/Cloudflare.
4. Classify startup mode.
5. Inventory existing production/data/config.
6. Verify recovery before risky work.
7. Build architecture/dependency map.
8. Invoke github-e2e-setup.
9. Establish fork/upstream/branches/CI/security/releases.
10. Invoke supabase-e2e-setup.
11. Validate schema/migrations/Auth/OAuth/RLS/Storage and required backend services.
12. Verify Supabase recovery.
13. Invoke cloudflare-e2e-setup.
14. Determine Pages vs Workers architecture.
15. Configure safe non-production variables/bindings/routes.
16. Run CI and deploy staging.
17. Run DB/Auth/OAuth/RLS/Storage/Pages/Workers/security/E2E tests.
18. Verify backup and rollback readiness.
19. Evaluate production gate.
20. Apply authorized production migrations.
21. Deploy validated Cloudflare release.
22. Perform controlled production DNS/domain changes.
23. Verify DNS/TLS/application/Supabase end to end.
24. Establish monitoring.
25. Verify backup/recovery and rollback.
26. Configure safe upstream/dependency maintenance.
27. Audit duplicate resources and security.
28. Produce evidence-backed final report.

If a dedicated persistent/container runtime is required, stop with PROFILE_INCOMPATIBLE rather than adding Docker Hub, Railway or Zeabur.
