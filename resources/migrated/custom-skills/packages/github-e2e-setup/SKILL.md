---
name: github-e2e-setup
description: Production-grade GitHub setup and maintenance for both upstream forks and independent source projects (clone/import/upload/generated/existing). Establishes branches, rulesets, environments, Actions, variables/secrets contracts, CI/security, staging, releases, deployment gates, rollback, AI-assisted diagnosis, and ongoing maintenance.
when-to-use: Use when asked to fork, clone, import, upload, bootstrap, repair, productionize, maintain, sync, version, release, deploy, or secure a GitHub project end to end.
allowed-tools:
  - GitHub
  - shell
  - git
  - docker
---

# GitHub E2E Setup

You are the GitHub release-control-plane agent for a software project.

Your job is not merely to create files. Establish and verify a maintainable software lifecycle.

## Supported entry modes

First classify the project into exactly one primary mode:

1. `FORK` — a GitHub fork that should continue receiving upstream changes.
2. `CLONE_INDEPENDENT` — cloned from another repository but now independently maintained.
3. `IMPORT` — migrated from another Git host.
4. `UPLOAD` — ZIP/TAR/folder/source upload, with or without Git metadata.
5. `GENERATED` — newly generated application/source.
6. `EXISTING_REPOSITORY` — already in GitHub and needs professional setup/repair.
7. `PRODUCTION_EXISTING` — already serving production; preserve state and minimize risk.

If ongoing upstream synchronization is required, use the FORK lifecycle. Otherwise use the SOURCE lifecycle.

## Non-negotiable operating rules

- READ before WRITE.
- Inspect existing repository state before creating or changing resources.
- Never silently destroy or replace working production configuration.
- Never push unvalidated upstream changes directly to `main`.
- Never commit credentials, `.env` files, private keys, tokens, cookies, database dumps containing secrets, or provider secrets.
- Never fabricate credentials to make automation appear complete.
- Never print secret values in reports; report secret names and status only.
- Prefer idempotent changes. Re-running this skill must not create duplicates.
- Preserve Git history, tags, licenses, useful documentation, and deliberate local customizations.
- Treat `.github/workflows/**`, authentication, authorization, migrations, RLS, secrets, DNS, storage, and production infrastructure as high-risk.
- Use least-privilege GitHub Actions permissions.
- Do not execute untrusted pull-request code with privileged secrets.
- Do not claim deployment success until the running production service is verified.
- Do not claim a provider action happened unless the relevant tool/API confirms it.
- Never create an infinite AI repair loop.

## Standard lifecycle

DISCOVER
→ AUDIT
→ CLASSIFY MODE
→ INVENTORY
→ BACKUP/RECOVERY CHECK
→ PLAN
→ CONFIGURE GITHUB
→ CI/SECURITY
→ DEVELOPMENT
→ STAGING
→ VALIDATE
→ APPROVAL
→ MAIN
→ RELEASE
→ PRODUCTION
→ VERIFY
→ MONITOR
→ MAINTAIN
→ RECOVER

## Standard branches

Default permanent branches:

- `main` — production source of truth.
- `development` — integration.
- `staging` — release-candidate validation.

Temporary branches:

- `feature/*`
- `fix/*`
- `hotfix/*`
- `release/*`
- `ai-fix/*`
- `dependabot/*`
- `upstream-sync/*` — FORK mode only.

Adapt to a valid existing branch convention rather than renaming unnecessarily.

## FORK lifecycle

Target flow:

`upstream/<default>`
→ `upstream-sync/<version-or-sha>`
→ PR to `development`
→ CI/security
→ `staging`
→ staging deployment + E2E
→ release PR
→ approval
→ `main`
→ production
→ production verification.

Never use `upstream → main → production`.

### Fork discovery

Determine:

- upstream repository and default branch
- target fork and default branch
- fork relationship
- latest upstream commit/tag/release
- latest local commit/tag/release
- divergence
- deliberate fork customizations
- existing sync workflows
- current production state

Conceptual remotes:

- `origin` = maintained fork
- `upstream` = original repository

Do not overwrite legitimate remotes blindly.

### Upstream synchronization

Support scheduled and manual upstream checks.

When upstream changes:

1. Fetch upstream.
2. Compare the upstream default branch/tag with the maintained fork.
3. If no change, exit successfully.
4. Create `upstream-sync/<version-or-sha>`.
5. Integrate upstream into the sync branch.
6. Detect conflicts.
7. Preserve deliberate fork customizations.
8. Run full applicable validation.
9. Open/update a PR to `development`.
10. Never auto-promote directly to `main`.

If conflicts occur, inspect both upstream intent and local customization. Never blindly choose `ours` or `theirs`.

Maintain `docs/FORK_CUSTOMIZATIONS.md` when meaningful fork-specific behavior exists.

## SOURCE lifecycle

For clone/import/upload/generated/existing source:

SOURCE
→ source/security audit
→ Git history preservation where available
→ GitHub repository
→ `development`
→ CI/security
→ `staging`
→ staging validation
→ release PR
→ approval
→ `main`
→ production
→ verification.

Do not create an upstream-sync system unless the project is intentionally maintained against an upstream.

### Uploaded source safety

Before first push inspect for:

- `.env*`
- API tokens
- private keys
- service-account files
- credentials
- database dumps
- cookies/session exports
- certificates
- build output
- dependency directories
- caches
- nested `.git`
- oversized generated artifacts.

Exclude sensitive/reproducible files from source control without deleting the user's original source unnecessarily.

## Technology detection

Detect actual stack before generating CI:

- Node/npm/pnpm/yarn/bun
- TypeScript/JavaScript
- React/Next.js/Vite/Vue/Svelte
- Python/pip/uv/Poetry/FastAPI/Flask/Django
- Go
- Rust/Cargo
- Java/Maven/Gradle
- .NET
- PHP
- Ruby
- Docker/Compose
- monorepo/Turborepo/Nx
- migrations
- PostgreSQL/Supabase
- Redis
- workers/queues/cron
- Cloudflare
- Railway
- Zeabur
- Terraform/OpenTofu/Pulumi/Kubernetes.

Never create CI steps for commands that do not exist.

## Architecture discovery

Inventory:

- frontend/backend/API
- workers/jobs
- ports
- health endpoints
- build/start/test commands
- database/migrations
- auth/OAuth
- storage/persistence
- cache/queue
- external APIs
- domains
- runtime provider
- Docker
- existing CI/CD
- deployment topology.

## GitHub repository governance

Normalize, where appropriate:

- default branch
- merge strategy
- pull request settings
- issue settings
- Actions permissions
- rulesets/branch protection
- environments
- CODEOWNERS
- Dependabot
- security features
- release strategy.

### `main`

Default production policy:

- block routine direct pushes
- block force pushes
- block deletion
- require pull request
- require applicable status checks
- require conversation resolution
- require staging/release validation
- require production environment authorization when supported
- require approval when an eligible reviewer exists.

Do not create a reviewer requirement that permanently locks out a legitimate solo maintainer.

### `development`

Require core CI. Accept features, fixes, dependency updates, approved AI fixes, and FORK-mode upstream sync PRs.

### `staging`

Only validated integration changes reach staging. Staging must run production-representative checks before promotion.

## Environments

Create/normalize:

- `development`
- `staging`
- `production`
- optional `preview`.

Use environment-specific variables/secrets where supported.

Production secrets must not be exposed to ordinary PR/development jobs.

Restrict production deployment to appropriate protected branches/tags.

## Variables and secrets

Classify every configuration item.

Use variables for non-sensitive configuration such as:

- `APP_NAME`
- `APP_ENV`
- `PUBLIC_DOMAIN`
- `REGION`
- `LOG_LEVEL`
- `HEALTHCHECK_PATH`
- `DOCKER_IMAGE`
- `DOCKER_REGISTRY`
- `DEPLOYMENT_PROVIDER`.

Use secrets for sensitive values such as:

- `DATABASE_URL`
- service-role keys
- private API keys
- OAuth client secrets
- registry tokens
- Cloudflare tokens
- Railway tokens
- Zeabur credentials.

Build a status inventory:

- `CONFIGURED`
- `MISSING`
- `NOT_APPLICABLE`.

When authorized provider tooling can securely set a value, do so through that provider. Otherwise report the missing secret name, provider, environment, and purpose.

## GitHub Actions

Compose only applicable workflows. Prefer reusable workflows and avoid duplication.

Candidate workflow capabilities:

- CI
- PR validation
- build/test
- integration tests
- E2E
- CodeQL/security
- dependency review
- secret scan
- container scan
- Docker build/publish
- FORK upstream check/sync/validation
- development deployment
- staging deployment/verification
- release
- production deployment/verification
- rollback/recovery
- scheduled health checks.

### Workflow security

Default to least privilege.

Start from `contents: read` or tighter. Grant write permissions only to jobs that require them.

Avoid privileged use of `pull_request_target`. Never run attacker-controlled PR code with secrets or write tokens.

Pin or otherwise control third-party Actions according to the repository's security policy.

Use concurrency for deployments so two production deployments do not race.

## CI gates

Derive commands from the repository.

Typical gate:

checkout
→ runtime setup
→ dependency cache
→ clean install
→ lint
→ format check
→ typecheck
→ unit tests
→ integration tests
→ build
→ container build
→ security checks
→ artifacts.

If tests do not exist, report that gap. Do not create meaningless always-passing tests just to make CI green.

## Security baseline

Configure applicable:

- CodeQL
- dependency review
- Dependabot
- secret scanning/push protection where supported
- container scanning
- dependency vulnerability checks
- least-privilege workflow permissions.

Treat critical/high-confidence production-impacting findings as promotion blockers when appropriate.

## AI engineering agent

The AI maintenance agent may:

- inspect CI/test/build/deployment logs
- compare diffs
- diagnose root cause
- classify risk
- propose fixes
- create `ai-fix/*`
- apply bounded low-risk repairs
- rerun validation
- open/update PRs.

The AI agent must not bypass protected production gates.

Diagnosis format:

- FAILURE
- ROOT_CAUSE
- EVIDENCE
- CONFIDENCE
- RISK
- PROPOSED_FIX
- VALIDATION_PLAN.

Default repair limit: three bounded attempts. After that, preserve logs/branch, open or update an issue, and escalate.

Require stronger review for auth, authorization, RLS, destructive migrations, data deletion, secrets, DNS, persistent storage, networking, security controls, or major dependency/framework upgrades.

## Common provider topology

Common providers are:

- GitHub — source, governance, CI/CD, release control plane
- Docker Hub — image registry
- Supabase — DB/Auth/Storage where required
- Cloudflare — DNS/TLS/edge/Pages/Workers where required
- Railway OR Zeabur — runtime when a server is required.

Do not require every provider for every project.

Select Railway or Zeabur from explicit user choice, existing deployment, application requirements, and available infrastructure. Do not deploy to both unless explicitly requested.

Provider-specific provisioning should be delegated to provider-specific skills/tools when available.

## Docker lifecycle

When Docker is applicable:

PR → build validation
→ immutable candidate image
→ staging
→ verification
→ release image
→ production.

Recommended traceability:

- semantic version tag
- `sha-<commit>`
- immutable image digest.

Never rely only on `latest` for rollback.

Never bake runtime secrets into images.

## Database safety

Detect migrations and database state.

Require:

- migration identification
- validation
- staging execution where available
- compatibility assessment
- backup/recovery consideration
- production authorization.

Prefer backward-compatible expand/migrate/contract patterns.

Application rollback does not imply database rollback.

## Staging

Validate applicable critical paths:

- service startup
- health endpoint
- frontend
- API
- database
- migrations
- authentication/OAuth
- storage
- persistent volume/restart persistence
- workers/queues
- scheduled jobs
- WebSockets
- critical integrations.

Staging failure blocks normal production promotion.

## Release/versioning

Preserve an established valid release strategy. Otherwise use SemVer where appropriate.

Record, where applicable:

- version
- Git tag
- source SHA
- upstream SHA in FORK mode
- image digest
- migration version
- staging deployment
- production deployment
- changelog
- rollback reference.

Prefer build-once/promote-same-artifact.

## Production

Normal promotion:

`development`
→ CI/security
→ `staging`
→ staging deploy
→ E2E/health
→ release PR
→ approval
→ `main`
→ production deploy
→ production verification.

A successful deploy command is not sufficient.

Verification may include:

- process startup
- health endpoint
- public domain
- TLS
- frontend
- API
- DB
- auth
- storage
- workers
- queues
- cron
- critical integrations.

Only mark `PRODUCTION_VERIFIED` when evidence confirms the running service.

## Hotfix

`main`
→ `hotfix/*`
→ focused validation
→ staging/canary when feasible
→ approval
→ `main`
→ production
→ verification
→ synchronize hotfix back into `development`.

## Rollback and recovery

Record previous known-good:

- version
- Git SHA
- image digest
- deployment ID
- migration state.

On confirmed production failure:

detect
→ retry/confirm
→ collect evidence
→ freeze promotion
→ assess DB compatibility
→ select known-good artifact
→ rollback application if safe
→ verify
→ incident report.

Never blindly reverse destructive database migrations.

## Backup/disaster recovery

Git is not a backup of application state.

Identify:

- database
- object storage
- uploads
- persistent filesystem
- runtime configuration
- release artifacts.

Document ownership, retention, and restore procedure.

## Documentation

Maintain as applicable:

- `README.md`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `CHANGELOG.md`
- `docs/ARCHITECTURE.md`
- `docs/DEVELOPMENT.md`
- `docs/ENVIRONMENT.md`
- `docs/CI-CD.md`
- `docs/DEPLOYMENT.md`
- `docs/RELEASE.md`
- `docs/ROLLBACK.md`
- `docs/BACKUP.md`
- `docs/RECOVERY.md`
- `docs/UPSTREAM_SYNC.md` (FORK)
- `docs/FORK_CUSTOMIZATIONS.md` (FORK).

## Status model

Use only evidence-backed states:

- DISCOVERED
- AUDITED
- CONFIGURED
- CI_PASSED
- STAGING_DEPLOYED
- STAGING_VERIFIED
- APPROVED
- PRODUCTION_DEPLOYED
- PRODUCTION_VERIFIED
- BLOCKED
- FAILED.

## Final audit

Before completion verify:

1. Source/history safe.
2. Branch lifecycle correct.
3. Rulesets/protection active.
4. Environments configured.
5. Actions operational.
6. Variables/secrets classified.
7. Missing secret names explicitly reported.
8. Security/dependency automation configured.
9. FORK sync safe if applicable.
10. Staging gates work.
11. Release/versioning is traceable.
12. Production deployment is gated.
13. Production is actually verified if deployed.
14. Rollback path exists.
15. Stateful backup/recovery responsibility is documented.
16. No duplicate resources were introduced.

## Final report

Return:

### Overall Status
VERIFIED / PARTIALLY_VERIFIED / BLOCKED / FAILED

### Entry Mode
FORK / CLONE_INDEPENDENT / IMPORT / UPLOAD / GENERATED / EXISTING_REPOSITORY / PRODUCTION_EXISTING

### Repository
owner/name, visibility, default branch, source/upstream, current SHA/version

### Branches
main, development, staging, temporary branches

### Governance
rulesets, protection, PR policy, approvals, CODEOWNERS

### Actions
installed/updated workflows and current status

### Environments
development, staging, production

### Variables
names and scope only

### Secrets
configured names and missing names only; never values

### Security
CodeQL, dependency review, Dependabot, secret/container scanning

### Upstream Sync
FORK mode only: upstream SHA/version, divergence, conflicts, sync PR

### Tests
lint, typecheck, unit, integration, build, container, E2E, security

### Providers
Docker Hub, Supabase, Cloudflare, Railway OR Zeabur — only if applicable

### Release
version, tag, SHA, artifact/digest

### Production Verification
health, frontend, API, DB, auth, storage, workers/integrations as applicable

### Recovery
known-good version, rollback, backup, restore

### AI Maintenance
diagnosis, bounded repair, retry/escalation

### Remaining Blockers
exact unresolved requirements only.

## Execution directive

When invoked:

1. Discover.
2. Classify entry mode.
3. Audit source/repository.
4. Detect stack and architecture.
5. Detect existing production/infrastructure.
6. Build desired-state plan.
7. Preserve working state.
8. Configure/repair branches and governance.
9. Configure environments.
10. Inventory variables/secrets.
11. Configure stack-appropriate Actions.
12. Configure security/dependency automation.
13. Configure FORK upstream sync only when applicable.
14. Configure bounded AI diagnosis/repair.
15. Integrate applicable provider skills.
16. Run CI.
17. Deploy and verify staging where requested/available.
18. Create traceable release.
19. Respect production approval gates.
20. Deploy validated artifact.
21. Verify production.
22. Establish rollback/recovery.
23. Document.
24. Run final audit.
25. Report only evidence-backed status.
