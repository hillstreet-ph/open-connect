---
name: inspect-analyze-e2e
version: 1.0.0
description: Universal pre-change project inspection, architecture discovery, knowledge reconstruction, dependency analysis, duplicate prevention, conflict prevention, AI-agent collaboration, change planning, evidence collection, and post-change verification orchestrator.
when-to-use: Run before any AI agent creates, edits, migrates, deploys, deletes, replaces, restructures, repairs, or configures an existing or new software/infrastructure project.
---

# inspect-analyze-e2e

## Mission

Be the mandatory project-intelligence and change-control layer before implementation.

Never begin with CREATE.

FIND → READ → INSPECT → DISCOVER → INVENTORY → ANALYZE → UNDERSTAND → COMPARE → VERIFY EXISTING → IDENTIFY GAP → PLAN → CHANGE ONLY WHAT IS MISSING OR INCORRECT → VERIFY.

The project may already contain part or all of the requested implementation.

## Master rules

INSPECT BEFORE EDIT.
ANALYZE BEFORE IMPLEMENT.
SEARCH BEFORE CREATE.
COMPARE BEFORE REPLACE.
VERIFY BEFORE DELETE.
BACKUP BEFORE DESTRUCTIVE CHANGE.
COORDINATE BEFORE PARALLEL CHANGE.
TEST BEFORE PROMOTION.
EVIDENCE BEFORE SUCCESS CLAIM.

## Operating modes

NEW_EMPTY
NEW_PARTIAL
EXISTING_REPOSITORY
EXISTING_APPLICATION
EXISTING_INFRASTRUCTURE
EXISTING_PRODUCTION
FORK
UPSTREAM_SYNC
MIGRATION
REFACTOR
BUG_FIX
FEATURE_CHANGE
DEPLOYMENT_CHANGE
CONFIGURATION_CHANGE
SECURITY_CHANGE
DATABASE_CHANGE
RECOVERY
UNKNOWN.

Never assume NEW_EMPTY.

## Risk

READ_ONLY
LOW_RISK
MEDIUM_RISK
HIGH_RISK
CRITICAL_PRODUCTION_CHANGE.

Risk controls scale with blast radius and reversibility.

## Lifecycle

REQUEST → CONTEXT COLLECTION → PROJECT DISCOVERY → KNOWLEDGE DISCOVERY → REPOSITORY INSPECTION → INFRASTRUCTURE DISCOVERY → RUNTIME DISCOVERY → DATABASE DISCOVERY → AUTH/SECURITY DISCOVERY → DEPLOYMENT DISCOVERY → DEPENDENCY ANALYSIS → CUSTOMIZATION ANALYSIS → CURRENT-STATE INVENTORY → DUPLICATE DETECTION → CONFLICT DETECTION → GAP ANALYSIS → IMPACT ANALYSIS → CHANGE PLAN → OWNERSHIP ASSIGNMENT → EXECUTION GATE → MINIMAL IMPLEMENTATION → TEST → VERIFY → UPDATE KNOWLEDGE → HANDOFF → FINAL REPORT.

## Context

Gather authorized relevant context from:
- current task/conversation
- project/repository instructions
- skills/agent instructions
- project knowledge base
- repository docs
- README/runbooks/ADRs
- issues/PRs/commits/releases
- deployment history
- migrations
- provider configuration
- previous reports/handoffs/task trackers.

Do not rely on memory alone when current project state can be inspected.

## Source priority

Prefer:
1. verified current production state
2. current repository
3. current provider configuration
4. current database/schema
5. current deployment configuration
6. approved current architecture docs
7. recent merged PRs/commits
8. current project instructions
9. maintained project knowledge base
10. prior handoffs
11. historical conversation/memory
12. assumptions.

Memory is supplementary, not authoritative live state.

## Confidence

VERIFIED
HIGH_CONFIDENCE
LIKELY
UNCERTAIN
UNKNOWN
CONFLICTING.

Never turn assumptions into facts.

## Sources of truth

Identify authority per domain:
SOURCE CODE → repository
SCHEMA → migrations/current DB
AUTH → provider config
SECRETS → secret store
DEPLOYMENT → runtime provider
DNS → authoritative DNS provider
CONTAINER → registry digest
DOCUMENTATION → maintained project docs
TASKS → designated task system.

Report declared-vs-actual drift.

## Repository inspection

Find project root; inspect repository/workspace metadata, package managers, lockfiles, build files, Docker, deployment, DB, CI, docs and agent instructions.

Inventory repository owner/name/default/current branch/origin/upstream/fork/Git status/uncommitted/untracked/recent commits/tags/releases/PRs/branches/protection/workflows.

Do not overwrite unknown dirty-worktree changes.

Map applications/packages/services/libraries/components/routes/APIs/database/migrations/tests/scripts/workflows/config/deployment/docs/generated files.

Detect actual languages/frameworks/package managers/runtime/build/test/lint/typecheck.

Find actual frontend/backend/API/worker/scheduler/CLI/container/serverless entrypoints.

## Dependencies

Inspect manifests/lockfiles/workspaces/internal packages/runtime/dev/peer dependencies.

Detect duplicates/conflicts/deprecations/security concerns/custom forks.

Do not mass-upgrade dependencies without task justification.

## Configuration and secrets

Find env schemas/examples/config modules/provider bindings/runtime vars/feature flags/build vars.

For secrets record names/provider/consumer/environment/storage/status, not values.

Route credential lifecycle work to `credentials-e2e-setup`.

## Infrastructure

Discover actual authorized providers/resources before creation.

Possible providers include GitHub, Docker Hub, Supabase, Cloudflare, Zeabur, Railway, Vercel, AWS, GCP, Azure, Kubernetes and project-specific systems.

Create:
RESPONSIBILITY → PROVIDER → RESOURCE → ENVIRONMENT → STATUS.

Detect duplicate ownership.

## Database

Inspect engine/schemas/tables/columns/constraints/indexes/views/functions/triggers/RLS/migrations/extensions/vector/jobs/backup.

Before creating DB objects, search current schema and migration history for exact and semantic equivalents.

Inspect applied/pending/failed migrations and drift.

Do not casually rewrite applied production migrations; prefer forward migrations.

## Auth/security

Inspect authentication provider, OAuth providers, callbacks/redirects, sessions, users/profiles, roles, permissions, authorization and RLS.

Do not introduce a second auth system without explicit architecture.

## Storage

Inspect buckets/directories/mounts/object stores/volumes/public-private policies/DB references/backup and authoritative owner.

## Runtime

Inspect runtime provider/project/environment/services/processes/ports/health/workers/jobs/volumes/networking/domains/deployment source or image/runtime variables.

Do not create duplicate service because existing service is unhealthy. Diagnose first.

## Containers

Inspect Dockerfile/Compose/base images/stages/entrypoint/CMD/ports/health/volumes/registry/tags/digests/architectures.

Determine source-build vs immutable-artifact deployment model.

## Edge

Inspect zone/DNS/proxy/TLS/WAF/rate limits/Workers/Pages/routes/domains/redirects/cache.

Do not create duplicate DNS/routes.

## CI/CD

Inspect workflows/triggers/permissions/environments/required checks/build/tests/security/image publishing/staging/production/rollback.

Detect duplicate deployment workflows.

## Automation

Find cron/scheduled workflows/database cron/runtime schedulers/workers/queues/webhooks/triggers.

Map:
LOGICAL JOB → OWNER → SCHEDULE/TRIGGER → CONSUMER.

Normally one production scheduler per logical job.

## External integrations

Identify authorized relevant APIs/OAuth/webhooks/email/storage/AI/analytics/monitoring/messaging and other services.

## Documentation and decisions

Read README/ARCHITECTURE/CONTRIBUTING/DEPLOYMENT/SECURITY/BACKUP/ROLLBACK/RECOVERY/RUNBOOK/FORK/UPSTREAM_SYNC/provider docs/ADRs.

Compare docs to actual state.

Do not reverse an ADR without understanding reason, current validity and migration impact.

## Forks/customizations

For forks identify upstream/origin/version/local customizations/branding/patches/schema/deployment changes.

Never replace a customized fork with a fresh upstream clone.

Maintain customization map:
CUSTOMIZATION | LOCATION | PURPOSE | UPSTREAM IMPACT | OWNER | TEST | STATUS.

## Production

If live production exists identify production URL/release/Git SHA/container digest/DB migration/runtime deployment/DNS/storage/volumes/workers/jobs/integrations.

Production state is critical evidence.

## Backup/monitoring

Before high-risk changes inspect source/DB/object storage/volumes/config/container artifact recovery.

Do not equate "backup enabled" with verified restore.

Use existing logs/metrics/traces/error tracking/health/alerts before adding observability systems.

## Knowledge base and memory

Inspect relevant authorized project knowledge only.

Memory may identify prior decisions, architecture, failures and conventions, but MEMORY != CURRENT STATE. Revalidate critical facts.

## Prior agent work

Search branches/PRs/commits/worktrees/tasks/handoffs/agent-state/locks/issues/deployments for active or completed agent work.

Do not duplicate active work.

## Collaboration

For each agent track:
AGENT
TASK
SCOPE
FILES/RESOURCES OWNED
DEPENDENCIES
STATUS
STARTED
LAST UPDATE
HANDOFF.

Task states:
DISCOVERING
ANALYZING
PLANNED
BLOCKED
READY
IN_PROGRESS
WAITING_DEPENDENCY
TESTING
VERIFYING
DONE
FAILED
HANDED_OFF.

For high-conflict resources use logical locks when supported:
DATABASE_SCHEMA_LOCK
PRODUCTION_DEPLOY_LOCK
DNS_LOCK
AUTH_CONFIG_LOCK
RELEASE_LOCK.

Do not invent a parallel locking system if the collaboration platform already provides one.

## Handoff

Every agent handoff:
TASK
STATUS
CHANGES MADE
FILES CHANGED
RESOURCES CHANGED
MIGRATIONS
CONFIG CHANGES
TESTS RUN
EVIDENCE
KNOWN ISSUES
BLOCKERS
NEXT ACTION
ROLLBACK NOTES.

No secret values.

## Change journal

Track timestamp/agent/task/resource/before/change/reason/after/verification/commit-PR-deployment reference when appropriate.

## Duplicate detection

Before creating any resource compare name/type/purpose/owner/environment/configuration/consumer/location.

Semantic equivalence matters, not exact names.

Before files: search same/similar filenames, exports, functionality, routes, configuration purpose.
Before UI: search shared/design-system/feature components.
Before API: inspect routes/controllers/RPC/server actions/functions/workers.
Before DB: inspect schema/migrations for semantic equivalents.
Before infrastructure: search actual provider account.
Before env var: detect aliases and establish canonical variable.
Before scheduler: search all scheduler layers.

## Conflict detection

Detect:
- same file modified by multiple branches/agents
- same migration number/intent
- same DB resource changed in parallel
- conflicting env values
- competing DNS changes
- competing deployments
- dependency version conflicts.

Resolve ownership/intent before merge/deploy.

## Gap classification

For every requested requirement:
EXISTS_AND_VERIFIED
EXISTS_BUT_MISCONFIGURED
EXISTS_BUT_UNVERIFIED
PARTIALLY_EXISTS
MISSING
DUPLICATE
CONFLICTING
OBSOLETE
NOT_REQUIRED
BLOCKED.

Only MISSING normally justifies creation.

Create requirement matrix:
REQUIREMENT | CURRENT STATE | EVIDENCE | GAP | ACTION | OWNER | RISK | DEPENDENCIES.

## Impact

Analyze users/data/API/schema/Auth/authorization/storage/runtime/deployment/DNS/integrations/fork/CI/rollback.

Blast radius:
LOCAL
SERVICE
ENVIRONMENT
CROSS_SERVICE
PRODUCTION_GLOBAL.

Prefer smallest correct change. Protect unrelated working systems.

## Planning and execution gate

Plan:
objective
current state
gaps
changes
files/resources
dependencies
risk
tests
rollback
agent ownership
execution order.

Before mutation require applicable:
PROJECT_UNDERSTOOD
SOURCE_OF_TRUTH_IDENTIFIED
DUPLICATE_CHECK_COMPLETE
CONFLICT_CHECK_COMPLETE
CHANGE_SCOPE_DEFINED
DEPENDENCIES_IDENTIFIED
RISK_CLASSIFIED
ROLLBACK_DEFINED
BACKUP_READY
AGENT_OWNERSHIP_ASSIGNED.

If critical items are unknown, do not perform risky mutation.

## Implementation

Apply only required delta.

Match existing framework/naming/directory/config/provider/test conventions.

Identify generated files and edit canonical source/generator instead.

For DB: inspect schema/history, use forward migration, test staging, verify data.
For Auth: inspect current users/callbacks/sessions/roles/RLS and protect login paths.
For deployment: identify current release/source/variables/runtime/health/rollback target.
For DNS: record TYPE/NAME/OLD/NEW/PROXY/TTL/ROLLBACK and verify origin first.

## Destructive operations

Deletion/drop/truncate/bucket or volume deletion/service deletion/credential revocation/DNS replacement/force-push production require verified need, impact analysis, recovery readiness, rollback and appropriate authorization.

Destruction is never the first troubleshooting step.

## Testing

Use applicable static validation/format/lint/typecheck/unit/integration/migration/RLS/container/runtime/API/UI/E2E/security tests.

Establish baseline when useful:
BASELINE → CHANGE → TEST → COMPARE.

Do not run irrelevant expensive tests without reason.

## Evidence

Important conclusions require evidence such as file path/reference, commit/PR/workflow/test/migration/provider resource/deployment/HTTP/health/DB query/config state.

Never claim fixed/deployed/configured/working/verified without evidence.

## Post-change

Verify requested behavior plus affected existing behavior/dependencies/security/data/runtime/deployment/integrations.

Run scoped regression checks.

For production verify applicable release identity/runtime/DB/Auth/RLS/Storage/API/frontend/workers/jobs/DNS/TLS/critical integration/E2E.

Update relevant README/architecture/runbook/deployment/provider/migration/fork docs/change journal/handoff.

## Durable knowledge

Store durable project facts only in approved project knowledge mechanism:
architecture
provider ownership
deployment model
branch model
naming conventions
decisions
constraints
recovery.

Never store secret values in project memory/docs.

## Required artifacts when useful

PROJECT-SNAPSHOT.md
ARCHITECTURE-MAP.md
PROVIDER-MAP.md
RESOURCE-INVENTORY.md
CHANGE-PLAN.md
DUPLICATE-REPORT.md
CONFLICT-REPORT.md
DRIFT-REPORT.md
AGENT-COLLABORATION.md
INSPECT-ANALYZE-HANDOFF.md.

## Agent startup protocol

Every collaborating agent:
1. Read project instructions.
2. Read PROJECT-SNAPSHOT if present.
3. Read ARCHITECTURE-MAP if present.
4. Read PROVIDER-MAP if present.
5. Read CHANGE-PLAN if present.
6. Read AGENT-COLLABORATION if present.
7. Read latest handoff.
8. Inspect Git status/current branch.
9. Inspect relevant recent commits/PRs.
10. Search requested functionality.
11. Check relevant provider resources.
12. Check active work/locks.
13. Revalidate critical state.
14. Plan only then.

Never begin by creating files.

## Pre-create

Ask:
DOES IT ALREADY EXIST?
SEMANTIC EQUIVALENT?
ANOTHER AGENT CREATING IT?
REQUIRED?
CORRECT OWNER/PROVIDER?
IDEMPOTENT?
ROLLBACK?
VERIFICATION EVIDENCE?

Unresolved → do not create yet.

## Pre-edit

Ask:
CANONICAL RESOURCE?
GENERATED?
UNCOMMITTED CHANGES?
ANOTHER AGENT EDITING?
DEPENDENCIES?
IN SCOPE?
TEST COVERAGE?

## Pre-delete

Ask:
WHY DUPLICATE/OBSOLETE?
REFERENCES?
PRODUCTION DATA?
BACKED UP?
ROLLBACK?
REPLACEMENT VERIFIED?
AUTHORIZED?

Default: PRESERVE.

## Failure

OBSERVE → EVIDENCE → CLASSIFY LAYER → ROOT CAUSE → OWNER → MINIMAL FIX → TEST → VERIFY.

Taxonomy:
CONTEXT_FAILURE
SOURCE_FAILURE
MERGE_CONFLICT
DEPENDENCY_FAILURE
CONFIGURATION_FAILURE
SECRET_REFERENCE_FAILURE
DATABASE_FAILURE
MIGRATION_FAILURE
AUTH_FAILURE
AUTHORIZATION_FAILURE
STORAGE_FAILURE
BUILD_FAILURE
CONTAINER_FAILURE
RUNTIME_FAILURE
NETWORK_FAILURE
DNS_FAILURE
TLS_FAILURE
CI_FAILURE
DEPLOYMENT_FAILURE
WORKER_FAILURE
JOB_FAILURE
INTEGRATION_FAILURE
E2E_FAILURE
DOCUMENTATION_DRIFT
DUPLICATE_RESOURCE
AGENT_CONFLICT.

Root-cause report:
FAILURE
LAYER
RESOURCE
OBSERVED
EXPECTED
EVIDENCE
ROOT_CAUSE
CONFIDENCE
IMPACT
PROPOSED_FIX
FILES/RESOURCES AFFECTED
ROLLBACK
VALIDATION.

Repair owning layer only.

Maximum 3 autonomous repair cycles for same failure:
DIAGNOSE → MINIMAL PATCH → TEST → VERIFY.
Then STOP, preserve evidence, report blocker.

Never degrade Auth/RLS/TLS/permissions/data isolation to make a test pass.

## Status

Project:
UNKNOWN
DISCOVERING
ANALYZED
PLANNED
READY_FOR_CHANGE
IN_PROGRESS
TESTING
STAGING_VERIFIED
PRODUCTION_VERIFIED
PARTIALLY_VERIFIED
BLOCKED
FAILED.

## Cross-skill orchestration

Normally:
inspect-analyze-e2e
→ determine verified gaps
→ credentials-e2e-setup when credential work is needed
→ relevant specialized provider skill/profile only
→ integration verification
→ knowledge/handoff update.

Examples:
inspect-analyze-e2e → gh-cf-sb-setup
inspect-analyze-e2e → gh-dh-cf-sb-setup
inspect-analyze-e2e → gh-cf-sb-zb-setup
inspect-analyze-e2e → gh-dh-cf-sb-zb-setup.

Do not silently expand provider set.

If credential gap is found, route credential lifecycle to credentials-e2e-setup rather than duplicating credential logic.

## Create-only-when-missing

SEARCH EXACT MATCH.
SEARCH SEMANTIC MATCH.
SEARCH PROVIDER.
SEARCH BRANCHES.
SEARCH DATABASE.
SEARCH CONFIGURATION.
SEARCH ACTIVE AGENT WORK.

Then:
EXISTS_AND_VERIFIED → REUSE
EXISTS_BUT_MISCONFIGURED → REPAIR
EXISTS_BUT_UNVERIFIED → VERIFY
PARTIALLY_EXISTS → COMPLETE
DUPLICATE → SELECT CANONICAL
CONFLICTING → RESOLVE
MISSING → CREATE
BLOCKED → REPORT.

Creation is the final option, not first action.

## Knowledge-first rule

Before complex implementation, understand for affected scope:
WHAT PROJECT DOES
HOW STRUCTURED
HOW BUILDS
HOW RUNS
WHERE DATA LIVES
HOW USERS AUTHENTICATE
HOW AUTHORIZATION WORKS
HOW DEPLOYS
WHICH PROVIDERS
WHAT IS PRODUCTION
WHAT IS CUSTOMIZED
WHAT IS CURRENTLY CHANGING
WHAT MUST NOT BREAK.

If these cannot be answered, continue inspection.

## Production safety

Production preservation outranks architectural cleanup.

Use:
DISCOVER → PRESERVE → BACKUP → STAGING → MIGRATE → VERIFY → CUTOVER
when migration is truly required.

## Stop conditions

Stop mutation and report when:
- critical source of truth cannot be determined
- required recovery is unavailable
- another agent owns conflicting high-risk scope
- known data loss lacks authorization
- required provider permission/credential unavailable
- critical test cannot be performed
- architecture ambiguity could damage production.

Continue safe discovery/documentation when mutation is blocked.

## Completion

Require:
PROJECT_CONTEXT_COLLECTED
PROJECT_STRUCTURE_UNDERSTOOD
SOURCE_OF_TRUTH_IDENTIFIED
CURRENT_STATE_INVENTORIED
PROVIDER_OWNERSHIP_MAPPED
EXISTING_IMPLEMENTATION_SEARCHED
DUPLICATE_CHECK_COMPLETE
CONFLICT_CHECK_COMPLETE
ACTIVE_AGENT_WORK_CHECKED
GAP_ANALYSIS_COMPLETE
IMPACT_ANALYSIS_COMPLETE
CHANGE_SCOPE_MINIMIZED
DEPENDENCIES_IDENTIFIED
TEST_PLAN_DEFINED
ROLLBACK_DEFINED_WHEN_REQUIRED
IMPLEMENTATION_VERIFIED_IF_PERFORMED
REGRESSION_CHECKED
KNOWLEDGE_UPDATED
HANDOFF_CREATED
EVIDENCE_RECORDED.

Only then status VERIFIED.

## Mandatory execution

Begin in INSPECT MODE.

Understand objective → identify projects → read instructions/knowledge/handoffs → inspect Git/repository/tree/frameworks/entrypoints/dependencies/tests/config/CI → discover infrastructure/DB/Auth/RLS/Storage/runtime/containers/edge/jobs/monitoring/backups/docs/ADRs/fork customizations/active agent work → map provider ownership/resources → search existing requested functionality → semantic duplicate/conflict/drift detection → requirement matrix → impact/risk/blast radius → minimal delta → agent ownership → tests/rollback → execution gate → authorized minimal implementation → test/verify/regression → deployment verification if applicable → update knowledge/handoff → evidence-backed final report.

The objective is not maximum changes. It is the smallest correct verified change after understanding what already exists, while preventing duplicate resources, conflicting agent work, regressions, data loss, drift and repeated reconstruction of project knowledge.
