# Open Connect — Project Overview

## Platform role

**AI workspace control plane.**

Open Connect defines what work should happen, who or which agent should perform it, which resources may be used, and which approvals and policies apply.

## Responsibilities

- Organizations, workspaces, CRM, projects, and tasks
- Agents, skills, plugins, MCP servers, and connections
- Credentials metadata, policies, approvals, automations, and schedules
- Model and provider routing, budgets, usage, and observability
- Integration with Open System and Open Box

## Ecosystem relationship

- [Open Connect](https://github.com/hillstreet-ph/open-connect) is the control plane.
- [Open System](https://github.com/hillstreet-ph/open-system) is the execution plane.
- [Open Box](https://github.com/hillstreet-ph/open-box) is the data and artifact plane.
- [Open Model](https://github.com/hillstreet-ph/open-model) provides model access and routing.
- Supporting services include Open TGate, Open Teleset, Open Hub, Open Payment, and Open KobePlay.

Each repository owns its implementation and versioned technical documentation. Cross-project changes should reference the affected repositories and preserve these responsibility boundaries.

## Security boundary

Open Connect may coordinate credential access but must not expose raw secrets in UI responses, logs, source code, tasks, prompts, or audit payloads.

Use placeholders in example configuration. Store runtime secrets in an approved secret manager, apply least-privilege access, redact sensitive logs, and require human approval for material permission, credential, finance, or production changes.

## Delivery expectations

A production-ready release should include:

- documented configuration and environment-variable contracts;
- automated tests and required CI checks;
- dependency and secret scanning;
- health checks, structured logs, and error monitoring;
- database migration and authorization review where applicable;
- backup, restore, rollback, and incident procedures;
- a reviewed deployment path for the selected runtime.

## Documentation map

Start with the repository README, then review the existing `docs/`, deployment guides, security policy, contribution guidance, and project-specific runbooks. Existing implementation documentation remains authoritative where it is more specific than this overview.

## Status note

This document describes the intended role and governance boundary. It does not by itself certify production readiness. Validate the current code, tests, deployment state, and open work before release.
