# Credential Autonomy Policy

## Goal

Allow Open-Connect agents and approved collaboration developers to complete bounded work without receiving, storing, or executing arbitrary code with raw credentials.

## Credential boundary

- Proton Pass or a provider-native secret store remains the source of truth.
- Open-Connect is the broker and policy enforcement point.
- Agent-facing references use `credential://service/purpose`; the broker maps them server-side to provider-native or `vault://` references.
- Only trusted connector processes may receive credential material. Agent-controlled subprocesses, sandboxes, pull-request code, prompts, memory, logs, artifacts, and repositories never receive raw values.
- Managed OAuth connectors are preferred over long-lived API keys.

## Request contract

The broker derives the actor from authenticated session or token claims. The caller cannot select or override the actor.

```json
{
  "credential_ref": "credential://service/purpose",
  "capability": "provider.operation",
  "target": "provider-resource-id",
  "project_id": "open-connect",
  "purpose": "bounded task description",
  "environment": "development|staging|production",
  "scope": ["required:operation"],
  "ttl_seconds": 900
}
```

The broker validates the capability, target, project, environment, and scope against allowlists and binds any execution handle to those values. It rejects attempts to request or reveal credential material. A successful response performs the bounded action through a trusted connector or returns a non-secret, single-purpose execution handle.

## Default agent permissions

| Capability | Autonomous operations | Approval gate |
|---|---|---|
| GitHub | Read, branch, commit, PR, CI inspection, bounded repair | Merge and protected environments follow repository rules |
| Docker Hub | Build, scan, tag; publish only to an approved private staging registry | Public staging, production, and `latest` publication |
| Cloudflare | Read configuration, preview deployment, logs, analytics | Every production mutation, including DNS, WAF, routes, variables, and restarts |
| Supabase | Schema inspection, advisory checks, isolated test queries | Migrations, Auth/RLS configuration, and production data mutation |
| Sentry | Read, triage, release verification | Delete, ownership, and notification-policy changes |
| Zeabur | Read projects/services/logs; isolated staging deployment | Every production mutation, domains, volumes, restarts, and destructive actions |

## Environment isolation

Development, staging, and production use distinct service identities and references. Production credentials are unavailable to untrusted code and pull-request jobs. A trusted connector receives only the minimum capability for the approved operation.

## Required controls

- authenticated broker-derived actor identity
- capability, target, project, and environment allowlists
- short-lived, single-purpose execution handles
- per-agent and per-project scopes
- rate limits and three-cycle repair limit
- immutable audit events containing actor, purpose, reference, capability, target, project, scope, result, correlation ID, and timestamp
- rollback target before production deployment
- no MFA, CAPTCHA, passkey, or provider-consent bypass

## Connection status vocabulary

Use the existing provider contract values for provider connections:

- `ready`: live authentication and a safe operation were verified
- `authorization_required`: an official OAuth or owner authorization flow is required
- `endpoint_required`: a supported endpoint must be configured
- `disabled`: the provider is intentionally unavailable

Credential-resolution internals may record more detailed private states, but must not replace or conflict with the public provider contract.

## Prohibited patterns

- caller-controlled actor or reveal fields
- arbitrary agent-controlled processes with injected secrets
- universal plaintext credential files
- secrets in model memory or knowledge bases
- shared browser cookies or personal browser profiles
- credentials embedded in skills or toolkit archives
- one unrestricted production token shared by every agent
- revealing vault items to work around connector limitations

This policy authorizes use-without-reveal through trusted connectors. It does not authorize disclosure or bypass provider safeguards.
