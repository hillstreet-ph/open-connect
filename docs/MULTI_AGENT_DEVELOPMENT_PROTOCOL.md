# Multi-agent development and autonomous delivery protocol

This protocol governs ChatGPT Work, Claude Cowork/Code, Grok, Codex, and future engineering workers across the HillStreet Open project family.

## 1. Source of truth

GitHub is authoritative for source, issues, task state, pull requests, checks, releases, and deployment evidence. Supabase owns application data and migrations. Docker Hub owns immutable images. Zeabur owns runtime services. Cloudflare owns DNS and edge policy. Sentry owns error and performance evidence.

Google Sheets is a credential inventory only. It may contain non-secret identifiers and Proton Pass/provider-secret references. It must never contain plaintext passwords, private keys, access tokens, service-role keys, or OAuth client secrets.

## 2. Repository map

| Repository | Default branch | Supabase project | Schema |
|---|---|---|---|
| open-connect | main | open-platform | open_connect |
| open-system | main | open-platform | open_system |
| open-model | main | open-platform | open_model |
| open-hub | main | open-platform | open_hub |
| open-box | main | open-platform | open_box |
| open-automation | master | open-platform | open_automation |
| open-kobeplay | main | open-operations | open_kobeplay |
| open-tgate | master | open-operations | open_tgate |
| open-teleset | main | open-operations | open_teleset |
| open-payment | main | open-operations | open_payment |

## 3. Agent hierarchy

1. Coordinator: selects one repository and one GitHub issue, checks dependencies, and assigns a worker.
2. Developer: makes the smallest change on an issue-scoped branch.
3. Reviewer: verifies intent, duplication, architecture, security, and tests.
4. QA worker: reproduces the issue and runs unit, integration, E2E, migration, and container checks that apply.
5. Release worker: creates the immutable version tag, release notes, Docker image, and provenance.
6. Deployment worker: deploys the approved digest, verifies health, records Sentry release data, and rolls back on failure.
7. Recovery worker: diagnoses failed checks or deployments and opens a narrowly scoped repair PR.

One worker may perform several roles, but it must preserve the role gates and evidence.

## 4. Discovery-first rule

Before creating code, files, services, workflows, tables, schemas, buckets, secrets, domains, or subscriptions:

1. Read the repository `AGENTS.md`, README, contribution guide, architecture docs, and local instructions.
2. Inspect the default branch, open issues, open PRs, recent commits, releases, workflows, Dockerfiles, deployment manifests, migrations, and Sentry evidence.
3. Search for existing components, utilities, APIs, tables, migrations, tests, and configuration that already solve or partly solve the task.
4. Confirm the issue still reproduces on the current default branch.
5. Extend or repair the existing implementation first.
6. Create a new component only when the capability is genuinely missing.
7. Record why a new component was necessary in the PR.

Never recreate merged work, duplicate an active PR, replace a working subsystem without evidence, or assume that an apparent omission is accidental.

## 5. Task lock and conflict prevention

Every change must have one GitHub issue and one active implementation branch.

Branch format:

```text
agent/<issue-number>-<short-purpose>
```

The coordinator must:

- search for an active issue or PR covering the same files and outcome;
- assign the issue to one worker identity;
- add an `agent:locked` label while implementation is active;
- record worker, repository, branch, affected paths, dependencies, and lease expiry in the issue;
- avoid parallel edits to overlapping files;
- release the lock when the PR closes or the lease expires.

Parallel work is allowed only when affected paths and migrations do not overlap.

## 6. Required work sequence

```text
intake
→ discovery
→ reproduce or establish baseline
→ plan
→ issue lock
→ branch
→ smallest implementation
→ local tests
→ security and migration checks
→ pull request
→ independent review
→ required checks
→ auto-merge eligibility
→ version tag
→ Docker image by digest
→ staging deployment
→ smoke and E2E verification
→ production deployment
→ health observation
→ completion or automatic rollback
```

## 7. Pull request contract

Every PR must state:

- linked issue and success criteria;
- existing implementation inspected;
- changed and intentionally unchanged areas;
- risks and security impact;
- tests run and exact results;
- database/storage/auth impact;
- deployment and rollback instructions;
- evidence links;
- whether the change is eligible for automatic merge.

A worker must not approve its own functional conclusions. Use an independent reviewer or deterministic policy checks.

## 8. CI and automatic repair

Required checks should include, where applicable:

- formatting and lint;
- type checking;
- unit tests;
- integration tests;
- build;
- dependency and secret scan;
- migration validation;
- RLS/security checks;
- container build;
- health endpoint;
- smoke test;
- E2E test;
- deployment manifest validation.

On failure, the recovery worker must read the failing job and logs, reproduce the failure, and patch the same branch. It may retry a transient infrastructure failure with bounded backoff. It must not weaken checks, delete tests, suppress findings, or loop indefinitely.

Maximum automatic repair attempts: three per failure signature. After that, mark the issue blocked with the evidence.

## 9. Merge policy

Automatic merge is permitted only when:

- the issue lock belongs to the PR;
- the branch is current with its base;
- all required checks pass;
- no unresolved review thread remains;
- no conflicting active PR exists;
- migrations and rollback are validated;
- no secret appears in the diff;
- the change is not a destructive production operation.

Use squash merge for ordinary feature and fix PRs unless the repository instructions require preserved commit authorship.

Destructive database changes, credential rotation, payment logic, production DNS ownership, authorization-boundary changes, and irreversible operations require an explicit approval record. Routine tested changes may remain autonomous.

## 10. Release and deployment

Use semantic versions:

- patch: backward-compatible fixes;
- minor: backward-compatible features;
- major: breaking changes or migrations.

A release must include:

- generated summary from merged PRs;
- commit SHA and immutable Docker digest;
- migration list;
- deployment target;
- rollback image/digest;
- known limitations.

Never deploy a mutable `latest` tag by itself. Deploy an immutable version or digest and retain the last known-good digest.

Deployment order:

1. verify backups for stateful changes;
2. deploy staging;
3. run smoke/E2E tests;
4. deploy production;
5. verify health endpoints, logs, and Sentry;
6. observe the defined stability window;
7. roll back automatically if error rate or health thresholds fail.

## 11. Connector selection

Use one integration path per capability:

1. native provider API, official GitHub App, or MCP;
2. Composio when managed OAuth or an AI-native connector is needed;
3. Slim.tools only when the capability is unavailable above;
4. Pipedream only for an existing workflow that cannot yet move to the primary automation path.

Do not connect the same provider through every platform. Document the chosen path and fallback in the issue.

## 12. Credential access

Workers receive least-privilege, environment-scoped credentials through connectors, GitHub environments, Supabase, Zeabur, Cloudflare, Sentry, or Proton Pass-approved workflows.

They must never:

- read the whole credential inventory when one reference is enough;
- paste a credential into an issue, PR, log, prompt, artifact, or Google Sheet;
- reuse production credentials in development;
- expose a Supabase service-role key to a client;
- store credentials in Docker images or repository files.

If a secret is exposed, stop using it, record the incident without repeating the value, rotate it, update provider secret stores, and validate affected deployments.

## 13. Scheduled operations

Recommended schedules:

- hourly: failed CI and deployment recovery;
- every six hours: application and API health reconciliation;
- daily: dependency, secret, backup, Sentry, and stale-lock review;
- weekly: release readiness, recovery test status, cost/usage, and roadmap reconciliation;
- monthly: credential rotation review and backup restoration test.

Schedules must be idempotent, use concurrency locks, maintain an execution ledger, and avoid opening duplicate issues.

## 14. Completion definition

A task is complete only when:

- the requested behavior is verified;
- relevant tests pass;
- the PR is merged;
- the release and Docker digest exist when deployable;
- the target environment is healthy;
- Sentry has the correct release/environment;
- rollback remains available;
- GitHub issue and deployment evidence are updated;
- documentation reflects the final state.

Do not claim deployment or production verification from a green build alone.
