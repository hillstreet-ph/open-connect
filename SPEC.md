# Open-Connect ChatGPT Autonomous Control App

## Value Proposition

Operate HillStreet and KobePlay infrastructure from ChatGPT through one governed Open-Connect control plane. The target users are verified owners and designated administrators who currently switch between provider dashboards, MCP servers, plugins, connectors, repositories, and deployment systems.

The current pain is fragmented configuration, duplicated credentials, uncertain connector health, inconsistent permissions, and manual verification across ChatGPT, Airtable, Composio, Pipedream, Slimtools, GitHub, Docker Hub, Cloudflare, Supabase, Sentry, and Zeabur.

**Core actions**:

1. Discover and inspect installed or available MCP servers, plugins, skills, tools, and provider connections.
2. Configure, install, update, and validate approved capabilities using server-side credential references.
3. Plan and execute autonomous workflows and deployments, pausing only at protected approval gates and returning verification plus rollback evidence.

## Why an LLM?

**Conversational win**: An operator can state an outcome such as “connect Airtable to Open-Connect, map it to KobePlay, validate access, and deploy the integration” instead of navigating several provider dashboards and translating the goal into provider-specific steps.

**LLM contribution**: Interpret intent, decompose goals, select appropriate connectors and skills, generate bounded execution plans, correlate provider state, diagnose failures, and summarize verified results.

**What the LLM lacks**: Direct custody of secrets, implicit production authority, durable state, provider APIs, identity context, and trustworthy execution evidence. Open-Connect supplies these through RBAC, a credential broker, approvals, execution adapters, and audit logs.

## UI Overview

**First view — Command Center**:

- Environment and provider health
- Installed plugins, skills, MCP servers, and connectors
- Pending approvals and failed runs
- Recent autonomous executions
- Natural-language goal input

**Key interactions**:

1. The operator states a goal.
2. The app displays the interpreted objective, target projects, chosen capabilities, risk class, and planned steps.
3. Read-only and reversible low-risk steps execute automatically.
4. Protected actions pause at an approval card containing scope, impact, rollback plan, and expiration.
5. The execution timeline streams tool calls, redacted evidence, retries, validation results, and correlations.
6. Marketplace discovery can recommend compatible MCP servers, plugins, connectors, and skills, but installation is policy-checked before activation.

**End state**:

- Verified result and health status
- Resources changed
- Audit correlation ID
- Approval record when applicable
- Rollback or recovery instructions
- Explicit blockers for anything not verified

## Product Context

### Existing products

- Open-Connect: identity, RBAC, projects, agents, skills, plugins, MCP connections, credentials, approvals, automations, schedules, usage, and audit control plane
- Open-System: supervised execution plane and worker runtime
- Open-Model: model gateway and routing plane
- Open-Box: data, artifacts, knowledge, and backups
- Open-Secret: credential gateway

### Infrastructure and providers

- GitHub, Docker Hub, Cloudflare, Supabase, Sentry, Zeabur
- ChatGPT plugins and MCP apps
- Airtable, Composio, Pipedream, and Slimtools
- Additional providers discovered through the approved MCP marketplace

### Airtable baseline

- Installed ChatGPT Airtable plugin: healthy
- MCP ping: successful
- Authorized workspace: `Kobeplay Organization`
- Workspace permission: `owner`
- Canonical secret reference: `credential://airtable/kobeplay`
- Raw Airtable PATs must never be stored in Git, skill packages, prompts, logs, or artifacts

### Authentication and authorization

- Supabase-backed Open-Connect identity and project membership
- Initial autonomous mutation authority: verified owners and designated administrators
- Scoped service identities for provider adapters
- OAuth preferred for user-scoped SaaS connections
- PAT/API keys resolved only by the server-side credential broker
- Separate development, staging, and production identities

### Autonomy and approval policy

Autonomous execution is allowed for read-only inspection, health checks, idempotent synchronization, reversible configuration, tests, and approved low-risk deployments within assigned projects.

Human approval remains mandatory for destructive or irreversible operations; credential creation, rotation, exposure, or revocation; authentication and account-security changes; production DNS changes; deleting data or storage; publishing externally; spending or purchasing; and permission escalation.

### Audit requirements

Every execution records actor, delegated agent, capability, target, environment, credential reference, policy decision, approval, tool result, correlation ID, timestamps, validation evidence, and rollback status. Secret values are always redacted.

## App Architecture

**Primary archetype**: submission-ready ChatGPT MCP app.

**Pattern**: decoupled data and render tools.

- Data tools return concise reusable `structuredContent`.
- Render tools attach versioned UI resources for the command center and execution timeline.
- The MCP Apps bridge is the portable integration surface; ChatGPT-specific APIs are compatibility enhancements.
- The public production transport is Streamable HTTP over HTTPS at a stable `/mcp` endpoint.

## Initial Tool Surface

| Tool                   | Purpose                                                                        | Default risk          |
| ---------------------- | ------------------------------------------------------------------------------ | --------------------- |
| `search`               | Search registered projects, providers, plugins, skills, MCP servers, and runs  | Read-only             |
| `fetch`                | Fetch one registered capability, resource, run, or provider record             | Read-only             |
| `inspect_connections`  | Test provider/MCP health and report authorization scope                        | Read-only             |
| `plan_goal`            | Convert an operator goal into a bounded execution plan                         | Read-only             |
| `execute_plan`         | Execute policy-approved steps and create approval requests for protected steps | Mutating              |
| `install_capability`   | Install or update an approved plugin, skill, MCP server, or connector          | Mutating              |
| `configure_connection` | Bind a provider connection through an opaque credential reference              | Mutating              |
| `rollback_run`         | Execute a recorded reversible rollback                                         | Destructive/protected |

Tool annotations must accurately declare read-only, destructive, idempotent, and open-world behavior.

## Security Constraints

- Never expose raw credentials to ChatGPT or widget code.
- Never place credentials in repository files, skills, MCP metadata, tool results, browser logs, or artifacts.
- Resolve `credential://...` references only within the trusted broker.
- Enforce owner/admin RBAC and project/environment scope on every mutating call.
- Require short-lived scoped provider tokens when supported.
- Verify package provenance, declared permissions, tool schemas, and endpoint security before capability installation.
- Sandboxed preflight and tests precede activation.
- Maintain circuit breakers, bounded retries, timeouts, and per-provider rate limits.
- Production promotion follows branch, tests, PR, required checks, approval, merge, deploy, and verification.

## Deployment Target

- Source: `hillstreet-ph/open-connect`
- Runtime: dedicated Zeabur service, isolated from the Open-System execution service
- Public transport: stable HTTPS Streamable HTTP `/mcp`
- State: Supabase/Postgres and external durable storage, not container-local files
- Secrets: Open-Secret/credential broker and runtime secret injection
- Observability: Sentry plus structured audit and provider health events

## Acceptance Criteria

1. ChatGPT can connect to the production `/mcp` endpoint and load current tool descriptors.
2. The command-center widget renders provider and capability health without exposing secrets.
3. `search` and `fetch` satisfy the standard read-only connector contract.
4. Airtable health and owner-authorized workspace discovery pass through the installed plugin.
5. Mutating tools enforce owner/admin RBAC, project scope, policy, and approval gates.
6. Repeated idempotent calls do not create duplicate installations or connections.
7. Every run emits a correlation ID, redacted audit record, validation result, and rollback status.
8. Local compile/tests, MCP initialization, tool listing, authentication rejection, and production smoke tests pass.
9. No raw provider credential appears in Git history, build artifacts, skill packages, logs, or tool responses.
10. Deployment uses a verified immutable artifact and preserves a documented rollback target.
