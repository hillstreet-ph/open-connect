# Kobeplay Open Platform Infrastructure Blueprint

> Canonical infrastructure and operating model for the Kobeplay/HillStreet Open project family.
>
> Status: PARTIALLY VERIFIED  
> Runtime: Zeabur only  
> Registry: Docker Hub  
> Database/Auth/Storage: Supabase  
> Public edge: Cloudflare  
> Observability: Sentry

## 1. Purpose

This document gives human developers and AI workers one authoritative architecture for the current multi-project environment. It prevents duplicate services, conflicting credentials, unsafe deployments, and contradictory database ownership.

Never include secret values in source code, commits, issues, pull requests, logs, documentation, or AI prompts.

## 2. One-owner architecture

| Responsibility | Provider | Rule |
|---|---|---|
| Source, branches, PRs, CI, releases | GitHub | All production changes originate here |
| OCI images and immutable release artifacts | Docker Hub | Build once and promote the same digest |
| PostgreSQL, Auth, RLS and object storage | Supabase | Exactly two shared backend projects |
| Application runtime | Zeabur | Do not create a parallel Railway production stack |
| DNS, TLS, proxy, WAF and edge routing | Cloudflare | Do not point DNS at an unverified origin |
| Application errors and traces | Sentry | Never log secrets or personal credentials |
| Human credential custody | Proton Pass | Provider secret stores receive only required runtime copies |

Target request path:

```text
User -> Cloudflare -> Zeabur service -> Supabase
                         |
                         +-> Sentry
```

> **Exception:** open-connect uses Cloudflare Pages for its public frontend at `open-connect.site`. The Zeabur service for open-connect runs only the backend API. Other repositories follow the standard Zeabur-proxied request path above.

Release path:

```text
GitHub SHA -> CI/tests/security -> Docker image -> Docker Hub digest
-> Zeabur staging -> E2E verification -> same digest in production
-> Cloudflare cutover -> production verification
```

## 3. Supabase organization and projects

Organization: `Kobeplay`

Region: Singapore / `ap-southeast-1`

### Project A: open-platform

- Project reference: `huadtiuuoiriqrjpjxhr`
- API URL: `https://huadtiuuoiriqrjpjxhr.supabase.co`
- Purpose: control plane, execution plane, models, hub, artifacts and automation.

| Repository | PostgreSQL schema | Role |
|---|---|---|
| open-connect | `open_connect` | Control plane and AI workspace |
| open-system | `open_system` | Execution plane and workers |
| open-model | `open_model` | Model gateway and routing |
| open-hub | `open_hub` | Integration/project hub |
| open-box | `open_box` | Data, artifacts and knowledge |
| open-automation | `open_automation` | Shared automation workflows |

Shared schemas: `platform_shared`, `platform_audit`.

Private storage buckets:

- `knowledge`
- `agent-artifacts`
- `project-artifacts`
- `automation-files`
- `model-files`
- `temporary-uploads`

### Project B: open-operations

- Project reference: `hoseohvgoiarxluxqwqv`
- API URL: `https://hoseohvgoiarxluxqwqv.supabase.co`
- Purpose: Kobeplay product and operational services.

| Repository | PostgreSQL schema | Role |
|---|---|---|
| open-kobeplay | `open_kobeplay` | Kobeplay application |
| open-tgate | `open_tgate` | Telegram gateway |
| open-teleset | `open_teleset` | Telegram configuration/services |
| open-payment | `open_payment` | Payment workflows and records |

Shared schemas: `operations_shared`, `operations_audit`.

Private storage buckets:

- `kobeplay-documents`
- `staff-assets`
- `telegram-media`
- `campaign-assets`
- `payment-evidence-private`
- `invoice-documents-private`

## 4. Database isolation rules

1. Every repository owns only its assigned application schema.
2. Cross-project tables belong in the matching `*_shared` schema.
3. Deployment/audit events belong in the matching `*_audit` schema.
4. All durable DDL changes must be migrations committed to GitHub.
5. RLS stays enabled for user-facing or tenant-owned data.
6. Never solve access errors by disabling RLS or making private buckets public.
7. Service-role access is server-side only.
8. Frontends may use only the public URL and publishable key.
9. No repository may create another standalone Supabase project without an approved architecture change.

Applied baseline migrations:

- `baseline_open_platform`
- `baseline_open_operations`
- `baseline_service_role_policies` in both projects

The latest security and performance advisor checks returned no findings at the time this blueprint was written.

## 5. Repository standards

Recommended branches:

- `main`: production-approved
- `development`: integration
- `staging`: release candidate
- `feature/*`, `fix/*`, `hotfix/*`, `release/*`, `ai-fix/*`

Rules:

- Respect repository default branches that currently use `master` until a controlled migration is approved.
- Never force-push or bypass branch protection.
- AI-generated changes use a dedicated branch and pull request.
- A failed required check blocks merge and deployment.
- All changes must be small, reviewable, reversible and documented.
- Never commit `.env`, tokens, passwords, private keys or service-role credentials.

## 6. Required configuration contract

Public/non-secret variables:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_PROJECT_REF`
- `SUPABASE_SCHEMA`
- `SENTRY_ORG`
- `SENTRY_PROJECT`
- `APP_ENV`
- `APP_VERSION`
- `GIT_SHA`

Secret variables:

- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL`
- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`
- `ZEABUR_API_KEY`
- `SENTRY_AUTH_TOKEN`
- repository-specific OAuth, webhook or provider secrets

Secret values must exist only in Proton Pass, GitHub environment secrets and the selected runtime/provider secret stores. Previously exposed credentials must be rotated before deployment automation is enabled.

## 7. Docker and release policy

Each deployable repository needs:

- production-ready `Dockerfile`
- `.dockerignore`
- `.env.example` containing names only
- non-root runtime where supported
- deterministic dependency installation
- health endpoint
- correct signal handling
- no embedded secrets

Required tags:

- `vX.Y.Z`
- `sha-<git-sha>`
- optional compatibility tags such as `vX.Y`

Never use `latest` as the only production identifier.

Release identity:

```text
APP_VERSION
<-> GIT_SHA
<-> DOCKER_TAG
<-> IMAGE_DIGEST
<-> SUPABASE_MIGRATION_VERSION
<-> ZEABUR_DEPLOYMENT
<-> CLOUDFLARE_ROUTE
<-> DEPLOYMENT_TIMESTAMP
```

## 8. CI/CD stages

A repository should run the applicable stages:

1. Format and lint
2. Type checking
3. Unit tests
4. Integration tests
5. Dependency and secret scanning
6. Static analysis
7. Migration validation
8. RLS/storage tests when applicable
9. Docker build
10. Container vulnerability scan
11. Publish immutable image
12. Deploy exact digest to Zeabur staging
13. Health and E2E tests
14. Production gate
15. Promote the same digest
16. Verify Cloudflare, runtime and Supabase
17. Record release evidence

Maximum automated repair attempts: three. After three failed cycles, preserve evidence and escalate.

## 9. Production gate

Do not deploy production until applicable gates are true:

- SOURCE_VERIFIED
- CI_PASSED
- SECURITY_PASSED
- IMAGE_BUILT
- IMAGE_SCANNED
- IMAGE_DIGEST_VERIFIED
- MIGRATIONS_VERIFIED
- AUTH_VERIFIED
- RLS_VERIFIED
- STORAGE_VERIFIED
- ZEABUR_STAGING_VERIFIED
- STAGING_DIGEST_VERIFIED
- BACKUP_READY
- ROLLBACK_READY
- APPROVED

Only `PRODUCTION_VERIFIED` means completion.

## 10. Cloudflare policy

Cloudflare owns public DNS, TLS and edge controls.

open-connect uses **Cloudflare Pages** for its frontend deployment at `open-connect.site`. For this repository, Cloudflare serves static assets directly while backend API traffic routes through the Zeabur service. All other repositories use the standard Cloudflare-proxied path to Zeabur.

Before changing DNS, record:

- record type and name
- previous target
- new Zeabur target
- proxy setting and TTL
- rollback target

Verify the Zeabur origin, application health and Supabase connectivity before cutover. Use secure end-to-end TLS. Do not cache authenticated or user-specific API responses.

## 11. Sentry mapping

Existing Sentry organization: `hillstreet`.

Existing project coverage includes open-connect, open-system, open-hub, open-box, open-kobeplay, open-tgate, open-teleset and open-payment.

Known missing projects:

- `open-model`
- `open-automation`

Create those only through an authorized write-capable Sentry connection. The current observability connector may be read-only.

## 12. Current readiness and blockers

Configured and verified:

- Two Supabase projects are active.
- Schemas, registries, audit tables, RLS policies and private storage buckets exist.
- Supabase security and performance advisors show no current findings.
- Repository-to-backend assignments are documented.
- Credential records were consolidated without retaining the exposed Supabase, Docker Hub or Zeabur token values.
- A monitor checks open-connect PR #54. CI checks are now passing; the PR is pending merge and deployment verification.

Blocking production activation:

1. Rotate all credentials previously exposed in conversation or spreadsheets.
2. Reconnect and verify Docker Hub write access and namespace ownership.
3. Create/verify Docker Hub repositories.
4. Provide write-capable Zeabur project/service management.
5. Add missing Dockerfiles to open-connect, open-automation, open-tgate, open-teleset and open-payment.
6. Add missing `.env.example` files to open-automation, open-tgate and open-payment.
7. Create the two missing Sentry projects using authorized write access.
8. Deploy and verify Zeabur staging before any Cloudflare DNS cutover.

## 13. Rollback and recovery

Before each production promotion record the previous Git SHA, Docker digest, Zeabur deployment, runtime configuration version, Cloudflare target and Supabase migration state.

Failure sequence:

```text
FREEZE -> DIAGNOSE -> CHECK DB COMPATIBILITY
-> SELECT PREVIOUS VERIFIED DIGEST -> REDEPLOY
-> VERIFY HEALTH -> RUN E2E
```

Do not automatically reverse database migrations when rolling back application code.

Recovery inputs:

- GitHub source and documentation
- known-good Docker image digest
- Supabase database backup
- Supabase Storage recovery
- Zeabur service configuration and volume backups
- secret inventory without values in GitHub
- Cloudflare DNS and security configuration

## 14. Change-control rule for AI workers

Every AI worker must:

1. Read this file and repository instructions.
2. Discover current provider state before writing.
3. Classify confirmed facts, recommendations and unknowns.
4. Make only the minimum necessary change.
5. Work in a branch and pull request.
6. Never expose credentials.
7. Run applicable tests.
8. Provide evidence, rollback instructions and unresolved blockers.
9. Stop on destructive, identity, secret, DNS, RLS, Auth or production-data risk.
10. Never claim full deployment without production E2E evidence.
