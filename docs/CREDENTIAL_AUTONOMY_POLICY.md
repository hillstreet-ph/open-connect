# Credential Autonomy Policy

## Goal

Allow Open-Connect agents and approved collaboration developers to complete routine development, testing, deployment, recovery, and observability work without receiving or storing raw credentials.

## Credential boundary

- Proton Pass or the provider-native secret store remains the source of truth.
- Open-Connect is the broker and policy enforcement point.
- Agents request a capability or a `credential://` reference.
- The broker injects the credential directly into the approved connector, subprocess, isolated sandbox, or CI job.
- Models, prompts, memory, skills, logs, artifacts, tickets, spreadsheets, and repositories never receive raw secret values.
- Existing managed OAuth connectors are preferred over API keys.

## Request contract

```json
{
  "credential_ref": "credential://service/purpose",
  "actor": "agent-id",
  "purpose": "bounded task description",
  "environment": "development|staging|production",
  "scope": ["required:operation"],
  "ttl_seconds": 900,
  "reveal": false
}
```

A successful response returns an execution handle or performs the requested action. It never returns the secret.

## Default agent permissions

| Capability | Autonomous operations | Production gate |
|---|---|---|
| GitHub | Read, branch, commit, PR, CI inspection, bounded repair | Merge/protected-environment rules |
| Docker Hub | Build, scan, tag, staging publish | Production/latest release |
| Cloudflare | Read configuration, preview deploy, logs and analytics | DNS, WAF, account security, production routes |
| Supabase | Schema inspection, advisory checks, test queries | Migrations, Auth configuration, RLS or production data mutation |
| Sentry | Read, triage, release verification | Delete, ownership or notification-policy changes |
| Zeabur | Read projects/services/logs; staging deploy | Production deploy, domains, volumes, destructive actions |

## Environment isolation

Development, staging, and production use different service identities and credential references. Production credentials are unavailable to untrusted code and pull-request jobs. CI receives secrets only for the step that requires them.

## Required controls

- capability and target allowlists
- short-lived execution handles
- redaction of command output and logs
- per-agent and per-project scopes
- rate limits and three-cycle repair limit
- immutable audit events containing actor, purpose, reference, scope, target, result, correlation ID, and timestamp
- rollback target before production deployment
- no MFA, CAPTCHA, passkey, or provider-consent bypass

## Status vocabulary

- `ready`: live authentication and a safe operation were verified
- `configured`: configuration exists but live authentication is not verified
- `blocked`: credential is invalid, missing, or lacks scope
- `pending_owner_consent`: provider requires an official owner authorization flow

## Prohibited patterns

- universal plaintext credential files
- secrets in ChatGPT memory or knowledge bases
- shared browser cookies or personal browser profiles
- credentials embedded in skill/toolkit archives
- one unrestricted production token shared by every agent
- revealing vault items to solve connector limitations

This policy authorizes use-without-reveal. It does not authorize credential disclosure or bypass provider authentication safeguards.
