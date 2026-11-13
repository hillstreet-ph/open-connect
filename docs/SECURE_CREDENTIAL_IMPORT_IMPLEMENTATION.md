# Secure Credentials Import — implementation specification

Status: proposed, development only. No secret ingestion is enabled by this document.

## Scope
- CSV: upload via authenticated HTTPS endpoint, stream with bounded size and row count, detect delimiter/encoding and map explicit fields; never render password or TOTP values in preview.
- Google Sheets: OAuth least-privilege read of selected spreadsheet/range, explicit consent and source review; do not sync continuously by default.
- ZIP: allowlisted CSV/JSON members only, reject encrypted archives unless explicitly supported, symlinks, path traversal, nested archives, decompression bombs, excessive file counts, and oversized uncompressed payloads.
- Autodetection: recognize supported export schemas by header signatures; unknown formats require manual mapping. Do not guess secret types.
- Preview: masked account identifier, normalized HTTPS origin, record type, conflicts and action (skip/new/replace). Require explicit per-batch confirmation before writing.
- Deduplication: tenant + normalized origin + username/account + credential type; default skip conflicts; preserve originals, audit updates.
- Storage: secret values go directly to server-side encrypted vault through a dedicated privileged ingestion boundary, never browser local storage, analytics, logs, MCP tool results, or LLM context. Enforce row-level ownership and least privilege. Do not use public service_credentials tables as generic password storage.
- 2FA: support TOTP enrollment and challenge verification through a secure server flow. Never expose seed to agents or logs. Recovery codes are sensitive secrets.
- Passkeys: WebAuthn registration/authentication using origin/RP ID binding and user verification. Private keys remain in the user's authenticator; CSV/ZIP passkey-private-key imports are not supported.
- Composio: link OAuth-connected account identifiers and opaque credential references, never copy provider refresh tokens into spreadsheets or chat.
- Security: CSRF defenses, rate limits, audit events, anti-malware validation, encryption at rest, retention and deletion policy, per-user access checks, idempotency keys, and explicit error handling.

## Phased delivery
1. Inspect existing credential UI, vault APIs, Supabase policies and tests. Map current behavior and threats.
2. Implement pure parsers and schema detectors with fixtures containing only synthetic test data; add adversarial ZIP/CSV tests.
3. Implement dry-run preview endpoint and client import wizard with Android Chrome support.
4. Implement encrypted server-side ingestion, idempotent commit and audit trail behind feature flag default OFF.
5. Integrate Google Sheets OAuth read flow, Composio references, TOTP and WebAuthn as separate modules.
6. Run bun run lint, bun run test, bun run build, bun run test:ssr, security review and staging end-to-end tests. Deploy only after verified approvals.

## Release gates
- No credential values returned by metadata or MCP listing APIs.
- No credential secret in request logs, traces, telemetry, browser persistence or error reporting.
- Negative tests for cross-tenant access, duplicate replacement, malicious archives, CSV formula injection, replay, unauthorized imports and failed WebAuthn verification.
- Explicit owner review of each import batch and any existing-secret replacement.
- Rollback and feature-flag disable documented before production rollout.
