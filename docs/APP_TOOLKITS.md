# Universal App Toolkits

This is the canonical capability contract for Open Connect. The machine-readable source is `config/app-toolkits.registry.json`.

## Runtime flow

Notion approval → GitHub issue/branch → isolated implementation → CI/security → PR review → staging → approval → production → health/Sentry verification → Notion evidence sync.

## Toolkit coverage

| App | Current evidence state | SDK/CLI | MCP/connector | Primary role |
|---|---|---|---|---|
| GitHub | Connected read/write | REST, GraphQL, Octokit | GitHub MCP | Source, CI, reviews, releases |
| Notion | Connected read/write | API, SDK, ntn | Notion MCP | Projects, tasks, agents, approvals |
| Supabase | Connected control plane | supabase-js, CLI, PostgREST | Supabase MCP | Database, auth, storage, functions |
| Cloudflare | Connected control plane | API, Wrangler | Cloudflare MCP | Pages, Workers, DNS, WAF, edge |
| Sentry | Needs authenticated connector | SDK, API, sentry-cli | Required | Errors, performance, releases |
| Docker Hub | Needs authenticated connector | Docker, Hub API, Buildx | Required | Images, tags, digests |
| Hetzner | Needs authenticated connector | API, hcloud, Terraform | Required | Servers, network, firewall |

“Zetzner” is normalized to Hetzner.

## Required package types

Each app toolkit consists of: connector adapter, MCP exposure, typed functions, SDK/ADK wrapper, health probe, capability allowlist, opaque credential reference, approval policy, audit emitter, retry/idempotency rules, and operator documentation.

## Security contract

- Real secrets never enter Git, prompts, Notion, logs, or agent context.
- Development, staging, and production identities stay separate.
- Production, DNS, credential, deletion, RLS, firewall, and account-security actions require human approval.
- Autonomous repair is limited to three bounded attempts and must use a branch and PR.
- A deployment is not complete until runtime health and critical integration checks pass.
- Every action records actor, agent, capability, target, environment, approval, correlation ID, result, timestamp, and evidence.

## Environment contract

Non-secret variables: APP_ENV, PUBLIC_DOMAIN, HEALTHCHECK_PATH, DOCKER_IMAGE, DEPLOYMENT_PROVIDER, SENTRY_ORG, SENTRY_PROJECT, HETZNER_PROJECT.

Opaque secret references: credential://github/app-installation, credential://notion/kobeplay, credential://supabase/open-connect, credential://cloudflare/open-connect, credential://sentry/hillstreet, credential://dockerhub/hillstreet, credential://hetzner/hillstreet.

## Completion criteria

An app is VERIFIED only when authentication, safe read, scoped staging write, audit event, failure behavior, and rollback/recovery are tested. Missing connectors remain NEEDS_CONNECTION; they must never be presented as production-ready.
