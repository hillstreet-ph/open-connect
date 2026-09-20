---
name: open-connect-agent
description: Operate Open-Connect projects, agents, connections, knowledge, API keys, audits, and approved deployment workflows through the Open-Connect MCP gateway.
---

# Open-Connect Agent

Use Open-Connect as the control plane for HillStreet projects. Prefer its MCP tools and native
GitHub or Supabase apps over browser automation.

## Operating sequence

1. Inspect the workspace, organization, project, environment, and connection status.
2. Resolve the smallest capability set that can complete the request.
3. Use logical credential references such as `credential://github/open-connect-deploy`; never ask a
   tool to return a secret value.
4. Run read-only discovery before mutations.
5. For code delivery, use branch → tests → pull request → required checks → approval → merge.
6. Require explicit approval for production deployment, database migration, DNS, credentials,
   account security, payments, destructive changes, or irreversible operations.
7. Return redacted evidence: target, action, result, correlation ID, checks, and remaining blockers.

## Environment contract

- `OPEN_CONNECT_API_KEY` authenticates the remote MCP connection and belongs in the Codex or
  ChatGPT secret facility, never this repository.
- `OPENAI_API_KEY` is used only by an approved server-side Agents API consumer.
- Provider credentials remain in their provider secret stores or the Open-Connect broker.
- Development, staging, and production use separate identities and credential references.

## Autonomous operation

Autonomous work may inspect, test, build, classify, open issues, and prepare pull requests. It must
not bypass protected branches, MFA, OAuth consent, CAPTCHA, production approvals, or provider
security controls. Stop after three failed repair attempts and report the evidence.
