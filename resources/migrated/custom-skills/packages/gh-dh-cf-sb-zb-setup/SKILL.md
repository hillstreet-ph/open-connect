---
name: gh-dh-cf-sb-zb-setup
description: Full production E2E orchestrator for GitHub source/fork governance, Docker Hub immutable OCI artifacts, Supabase database/Auth/RLS/Storage/backend services, Zeabur container runtime/services/workers/persistent volumes, and Cloudflare DNS/TLS/WAF/edge.
when-to-use: Use when a project requires GitHub + Docker Hub + Supabase + Zeabur + Cloudflare, with Docker Hub as the immutable container registry and Zeabur as the production application runtime.
---

# gh-dh-cf-sb-zb-setup

Coordinate:
- `github-e2e-setup`
- `docker-e2e-setup`
- `supabase-e2e-setup`
- `zeabur-e2e-setup`
- `cloudflare-e2e-setup`

## Strict profile

REQUIRED:
- GitHub
- Docker Hub
- Supabase
- Zeabur
- Cloudflare

NOT_REQUIRED:
- Railway

Do not silently introduce Railway.

## Target topology

GITHUB
→ CI / TEST / SECURITY
→ DOCKER BUILD
→ DOCKER HUB
→ IMMUTABLE IMAGE DIGEST
→ ZEABUR STAGING
→ INTEGRATION / E2E
→ PRODUCTION GATE
→ SAME IMAGE DIGEST
→ ZEABUR PRODUCTION
→ CLOUDFLARE
→ USERS

Application data/identity:
ZEABUR APPLICATION → SUPABASE DB / AUTH / RLS / STORAGE.

## Provider ownership

GitHub = source, fork/upstream, branches, PRs, CI, security, releases.
Docker Hub = OCI image registry, tags, digests, release artifacts.
Supabase = PostgreSQL, migrations, Auth/OAuth, RLS, Storage, backend data services.
Zeabur = application runtime, services, variables, networking, health, workers, jobs, persistent volumes.
Cloudflare = public DNS, custom domains, TLS, proxy/CDN, WAF, rate limiting, edge routing.

Cloudflare Pages/Workers are optional and used only when intentionally required.

## One-owner rule

Default:
SOURCE = GITHUB
CONTAINER_ARTIFACT = DOCKER_HUB
DATABASE = SUPABASE
AUTH = SUPABASE
OBJECT_STORAGE = SUPABASE_STORAGE
APPLICATION_RUNTIME = ZEABUR
PUBLIC_EDGE = CLOUDFLARE

Do not create duplicate databases, runtimes, schedulers, DNS ownership or authoritative stores without explicit architecture.

## Immutable release invariant

GIT SHA
→ CI
→ TEST
→ SECURITY
→ DOCKER BUILD
→ CONTAINER SCAN
→ DOCKER HUB
→ IMAGE DIGEST
→ ZEABUR STAGING
→ VERIFY
→ SAME DIGEST
→ ZEABUR PRODUCTION
→ CLOUDFLARE
→ PRODUCTION E2E

BUILD ONCE. PROMOTE THE SAME VERIFIED DIGEST.

STAGING_DIGEST must equal PRODUCTION_DIGEST for normal promotion.

If they differ, classify DIGEST_MISMATCH and stop promotion until resolved.

Never use `latest` as the sole production identity.

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

## Lifecycle

DETECT → DISCOVER → AUDIT → CLASSIFY → PRESERVE → BACKUP CHECK → ARCHITECT → MAP DEPENDENCIES → PLAN → GITHUB → SUPABASE → DOCKER → ZEABUR → CLOUDFLARE → SECURITY → CI → BUILD → SCAN → PUBLISH → STAGING → INTEGRATION/E2E → PRODUCTION GATE → PRODUCTION → VERIFY → MONITOR → BACKUP → ROLLBACK → RECOVERY → DOCUMENT → MAINTAIN.

## Read before write

Discover GitHub repository/origin/upstream/branches/PRs/Actions/environments/releases/security.

Discover Dockerfile/Compose/build context/base images/runtime/ports/health/persistent paths/registry repository/tags/digests/architectures/build pipelines.

Discover Supabase project/schema/tables/indexes/migrations/Auth/OAuth/RLS/Storage/API/Realtime/Functions/jobs/vector/Vault/backups.

Discover Zeabur projects/environments/services/current image/variables/networking/ports/health/volumes/workers/jobs/deployments/logs/domains.

Discover Cloudflare account/zone/DNS/DNSSEC/TLS/proxy/Pages/Workers/routes/domains/WAF/rate limits/cache/redirects.

Never create equivalents until existing state is understood.

## Production safety

If production exists, preserve it first.

Never blindly:
- force-push/reset main
- recreate repositories/projects/services
- overwrite release identity
- drop/truncate production data
- delete users
- disable RLS
- make private Storage public
- delete Storage
- delete/recreate Zeabur production volumes
- replace production variables blindly
- replace DNS/domains
- weaken TLS.

High-risk:
DISCOVER → IMPACT → VERIFY BACKUP/RECOVERY → DEFINE ROLLBACK → STAGING → APPROVAL → APPLY → VERIFY.

## Secrets

Never fabricate, print, commit, document or expose secret values.
Never bake runtime secrets into Docker images.
Never expose privileged Supabase credentials to frontend.
Reports contain NAME/OWNER/ENVIRONMENT/CONSUMER/STATUS only.

## Idempotency

DISCOVER → COMPARE → PLAN → APPLY MINIMAL DIFFERENCE → VERIFY.

Prevent duplicate repositories, branches, workflows, Docker repositories, Supabase projects/tables/policies/buckets/functions/jobs, Zeabur projects/services/volumes/domains and Cloudflare records/Pages/Workers/routes.

Do not create app-new/app-final/app-2 merely because an existing resource failed.

## GitHub

Invoke `github-e2e-setup`.

Fork:
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
upstream/default → upstream-sync/<version-or-sha> → compatibility review → CI/security → development → staging → candidate image → Zeabur staging → E2E → release PR → main → production.

Maintain `docs/FORK_CUSTOMIZATIONS.md`.

CI may include format/lint/typecheck/unit/integration/build/secret scan/dependency scan/SAST/Docker build/container scan/migration validation/RLS tests/staging/E2E.

Use least privilege and protected production environments.

## Docker

Invoke `docker-e2e-setup`.

Inspect existing Docker architecture before changing it.

Prefer:
- multi-stage build
- minimal runtime
- deterministic dependencies
- non-root user
- correct signal handling
- minimal attack surface
- no embedded secrets.

Use `.dockerignore` and exclude unnecessary local state/secrets/caches while retaining required build files.

Separate build arguments from runtime variables.

Recommended tags:
vX.Y.Z
vX.Y
vX
sha-<commit>
optional latest

Record immutable digest after publication.

Map:
APP VERSION ↔ GIT SHA ↔ DOCKER TAG ↔ IMAGE DIGEST.

Use multi-arch only when required and verified.

Scan candidate image before production promotion.

Environment-specific secrets belong in Zeabur runtime configuration, not image layers.

## Supabase

Invoke `supabase-e2e-setup`.

Model DB entities/PK/FK/constraints/indexes/timestamps/ownership/RLS deliberately.

Durable schema:
MIGRATION → VALIDATE → DEVELOPMENT → STAGING → TEST → BACKUP CHECK → APPROVAL → PRODUCTION → VERIFY.

Treat DROP/TRUNCATE/large destructive operations as high risk.

Verify Auth/OAuth/session/recovery as applicable.

Authentication != authorization.

RLS is a primary authorization boundary. Test anonymous, user A, user B, admin and privileged server identities where applicable. User A must not access user B private data unless authorized.

Never disable RLS to pass tests.

Classify Storage PUBLIC/PRIVATE. Sensitive/user data normally private. Verify upload/download/list/update/delete/authorization.

Storage migration:
INVENTORY → COPY → VERIFY SIZE/CHECKSUM → VERIFY METADATA/REFERENCES → CUTOVER → PRESERVE SOURCE.

Use Functions/jobs/vector only when required.

Exactly one production scheduler per logical job.

Verify actual DB backup/PITR and separate Storage recovery.

## Zeabur

Invoke `zeabur-e2e-setup`.

For this profile, preferred production application artifact is the Docker Hub image.

Discover/reuse existing project/environments/services.

Configure staging to the candidate image corresponding to the release Git SHA.

Record:
IMAGE
TAG
DIGEST
GIT SHA
ZEABUR DEPLOYMENT.

Production must use the same staging-verified digest.

Determine justified services:
WEB
API
WORKER
SCHEDULER

Do not split unnecessarily.

Ensure:
APPLICATION PORT
= CONTAINER RUNTIME PORT EXPECTATION
= ZEABUR SERVICE PORT
= HEALTH TARGET
= ROUTING EXPECTATION.

Use runtime-compatible bind interface.

Health must represent meaningful readiness. Running container != healthy application.

Runtime variable contract:
NAME
PURPOSE
SENSITIVE?
REQUIRED?
OWNER
ENVIRONMENT
STATUS

Never values.

Inject runtime secrets through Zeabur variables/secrets. Do not rebuild image to change runtime secrets.

Classify runtime paths:
EPHEMERAL
CACHE
TEMPORARY
PERSISTENT.

Persistent data must not exist only in disposable container filesystem.

Assign authoritative persistent dataset to:
SUPABASE DATABASE
SUPABASE STORAGE
ZEABUR VOLUME.

Document volume mount path/data/ownership/permissions/backup/restore.

Never delete/recreate production volume as a troubleshooting shortcut.

Where safe:
WRITE TEST → VERIFY → RESTART/REDEPLOY → VERIFY AGAIN.

Separate long-running workers when justified.

One scheduler owner per logical production job.

Use private/internal networking where appropriate and expose only required public services.

## Cloudflare

Invoke `cloudflare-e2e-setup`.

Preferred:
USER → CLOUDFLARE → ZEABUR ORIGIN.

Zeabur owns runtime. Cloudflare owns edge.

Pages/Workers are optional and should not duplicate Zeabur backend without architectural reason.

Before production DNS cutover verify:
correct Docker digest
Zeabur deployment
process/container
port
health
application response
Supabase connectivity.

Record DNS mutation:
TYPE
NAME
OLD TARGET
NEW TARGET
PROXY
TTL
ROLLBACK TARGET.

Use secure end-to-end TLS.
Do not weaken TLS to hide origin failures.

WAF/rate limits must not break legitimate OAuth, APIs, webhooks, health checks or application traffic.

Never cache authenticated/private/user-specific API responses or tokens.

Verify Cloudflare → Zeabur DNS/proxy/TLS/routing and WebSockets when required.

## Staging

Staging must represent:
candidate Git SHA
candidate Docker digest
compatible Supabase migration
Zeabur service architecture
runtime variables
networking
ports
health
workers/jobs
persistence
Cloudflare routing.

Run applicable:
format/lint/typecheck
unit
integration
build
container scan
container startup
migration
database
Auth/OAuth
RLS
Storage
API
Zeabur health
workers/jobs
persistence
Cloudflare route
DNS/TLS
WebSocket
security
E2E.

## Production gate

Require applicable:
SOURCE_VERIFIED
CI_PASSED
SECURITY_PASSED
IMAGE_BUILT
IMAGE_SCANNED
IMAGE_PUBLISHED
IMAGE_DIGEST_VERIFIED
MIGRATIONS_VERIFIED
AUTH_VERIFIED
RLS_VERIFIED
STORAGE_VERIFIED
ZEABUR_STAGING_DEPLOYED
ZEABUR_STAGING_VERIFIED
STAGING_DIGEST_VERIFIED
WORKERS_VERIFIED
PERSISTENCE_VERIFIED
CLOUDFLARE_STAGING_VERIFIED
BACKUP_READY
ROLLBACK_READY
APPROVED.

## Release identity

APP VERSION
↔ GIT SHA
↔ DOCKER TAG
↔ IMAGE DIGEST
↔ SUPABASE MIGRATION VERSION
↔ ZEABUR DEPLOYMENT
↔ CLOUDFLARE CONFIG/ROUTE
↔ TIMESTAMP.

## Production

Preferred:
VALIDATED GIT RELEASE
→ VERIFIED DOCKER DIGEST
→ AUTHORIZED DB MIGRATION
→ ZEABUR PRODUCTION USING SAME DIGEST
→ HEALTH VERIFY
→ SUPABASE VERIFY
→ CLOUDFLARE CUTOVER
→ PRODUCTION E2E.

After deployment, verify actual production artifact corresponds to intended digest where provider evidence allows.

Do not trust mutable tag alone.

Verify GitHub release, Docker digest, Zeabur deployment/runtime/port/health/workers/jobs/persistence, Cloudflare DNS/TLS/proxy, frontend/API, Supabase DB/Auth/OAuth/RLS/Storage/Functions and critical integrations.

## Status

PLANNED
CONFIGURED
CI_PASSED
IMAGE_VERIFIED
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

Monitor applicable application/Zeabur deployment/CPU/memory/storage/workers/jobs/Supabase DB/Auth/Functions/Cloudflare edge/availability/latency/errors.

Never log secrets.

## Backup

Treat independently:
GITHUB SOURCE
DOCKER ARTIFACT
SUPABASE DATABASE
SUPABASE STORAGE
ZEABUR VOLUMES
ZEABUR CONFIGURATION
CLOUDFLARE CONFIGURATION.

Retain known-good immutable image identities so rollback/recovery does not depend solely on rebuilding old source.

DB backup does not automatically cover Storage.

For critical Zeabur volumes define backup method/frequency/retention/restore target/restore validation.

## Rollback

Before production record:
previous Git SHA
previous Docker digest
previous Zeabur deployment
previous critical runtime config
previous Cloudflare target/routes
Supabase migration state.

Failure:
FREEZE → DIAGNOSE → CHECK DB COMPATIBILITY → PREVIOUS VERIFIED DIGEST → ZEABUR ROLLBACK/REDEPLOY → HEALTH → E2E.

Do not rebuild an old release and assume it equals the known-good digest.

Application/image rollback does not automatically reverse DB migrations or restore volume state.

Treat CODE, IMAGE, CONFIG, DATABASE and FILES separately.

## Disaster recovery

Reconstruct from:
GITHUB SOURCE
+ KNOWN-GOOD DOCKER IMAGE/DIGEST
+ SUPABASE DB BACKUP
+ SUPABASE STORAGE RECOVERY
+ ZEABUR CONFIG
+ ZEABUR VOLUME BACKUP
+ CLOUDFLARE CONFIG
+ SECRET INVENTORY.

Typical:
GITHUB → KNOWN-GOOD IMAGE → SUPABASE DB → STORAGE → ZEABUR PROJECT/SERVICES → VARIABLES → VOLUMES → DEPLOY IMAGE → HEALTH → CLOUDFLARE → E2E.

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
DOCKERFILE_FAILURE
BUILD_FAILURE
IMAGE_FAILURE
REGISTRY_FAILURE
DATABASE_FAILURE
MIGRATION_FAILURE
AUTH_FAILURE
OAUTH_FAILURE
RLS_FAILURE
STORAGE_FAILURE
FUNCTION_FAILURE
ZEABUR_DEPLOY_FAILURE
ZEABUR_RUNTIME_FAILURE
DIGEST_MISMATCH
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

DIGEST_MISMATCH:
if staging verified digest != production target digest, STOP promotion and investigate.

Maximum 3 automated repair cycles per failure:
DIAGNOSE → PATCH → CI → BUILD → STAGING → VERIFY.

Then STOP, preserve evidence and report blocker.

Never weaken RLS/Auth/TLS/data isolation, embed credentials in images, expose internal DBs, or use destructive production actions to pass tests.

## Maintenance

Fork upstream:
fetch → upstream-sync → compatibility → CI/security → candidate image → scan → Supabase compatibility → Zeabur staging → Cloudflare staging → E2E → release PR → production.

Dependency updates require CI/security/container build/scan/staging/E2E.

Review Docker base images/vulnerabilities/build reproducibility/stale tags, Supabase query/index/migration/RLS/Auth/Storage/backup state, Zeabur running image/resources/variables/services/health/workers/jobs/networking/volumes, and Cloudflare DNS/TLS/WAF/rate limits/cache/routes.

## Documentation

Maintain applicable:
docs/ARCHITECTURE.md
docs/PROVIDER_OWNERSHIP.md
docs/GITHUB.md
docs/FORK.md
docs/FORK_CUSTOMIZATIONS.md
docs/UPSTREAM_SYNC.md
docs/DOCKER.md
docs/DOCKER_RELEASES.md
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

## Provider status

GITHUB = REQUIRED
DOCKER_HUB = REQUIRED
SUPABASE = REQUIRED
ZEABUR = REQUIRED
CLOUDFLARE = REQUIRED
RAILWAY = NOT_REQUIRED

Provider states:
NOT_REQUIRED
DISCOVERED
CONFIGURED
STAGING_VERIFIED
PRODUCTION_VERIFIED
BLOCKED
FAILED.

## Evidence

Every success claim requires evidence.

GitHub → checks/workflows/releases.
Docker → build/scan/repository/tag/digest.
Supabase → migration/Auth/RLS/Storage tests.
Zeabur → deployment/image identity/process/port/health/workers/persistence.
Cloudflare → DNS/TLS/proxy/route.

Never infer success.

## Completion

Require applicable:
SOURCE_VERIFIED
+ FORK/UPSTREAM_VERIFIED
+ CI_VERIFIED
+ SECURITY_VERIFIED
+ IMAGE_BUILT
+ IMAGE_SCANNED
+ IMAGE_PUBLISHED
+ IMAGE_DIGEST_VERIFIED
+ DATABASE_VERIFIED
+ AUTH_VERIFIED
+ RLS_VERIFIED
+ STORAGE_VERIFIED
+ ZEABUR_STAGING_VERIFIED
+ STAGING_DIGEST_VERIFIED
+ ZEABUR_RUNTIME_VERIFIED
+ PRODUCTION_DIGEST_MATCH_VERIFIED
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

1. Detect application/source and confirm profile.
2. Discover GitHub, Docker, Supabase, Zeabur and Cloudflare.
3. Classify startup mode and existing production.
4. Inventory production data/config/artifacts/runtime and verify recovery.
5. Build dependency/ownership map.
6. Invoke github-e2e-setup and establish fork/upstream/branches/CI/security/release.
7. Invoke supabase-e2e-setup; validate schema/migrations/Auth/OAuth/RLS/Storage/backend services/recovery.
8. Invoke docker-e2e-setup; audit Docker architecture, build, scan, publish and record immutable digest.
9. Verify Git SHA ↔ digest.
10. Invoke zeabur-e2e-setup; reuse/create justified environments/services.
11. Configure staging to exact candidate image/digest, variables, networking, ports, health, persistence, workers/jobs.
12. Deploy and verify staging.
13. Run migration/Auth/RLS/Storage/worker/job/persistence tests.
14. Invoke cloudflare-e2e-setup; verify Zeabur origin before staging edge routing.
15. Verify staging DNS/TLS/proxy and run integration/security/E2E.
16. Verify staging digest, backup readiness and rollback state.
17. Evaluate production gate.
18. Apply authorized production migrations.
19. Deploy SAME verified digest to Zeabur production.
20. Verify production digest identity/runtime/port/health/Supabase connectivity.
21. Perform controlled Cloudflare production cutover.
22. Verify DNS/TLS/proxy/frontend/API/Auth/RLS/Storage/workers/jobs/persistence.
23. Run production E2E.
24. Establish monitoring.
25. Verify DB/Storage/volume recovery.
26. Establish image/runtime/database/DNS rollback.
27. Configure safe upstream/dependency/container maintenance.
28. Audit duplicates/security.
29. Produce evidence-backed final report.
