# Proton MCP authentication and runtime readiness

Status: **not production-verified**. This document is a repair checklist, not a claim of a working Proton connection.

## Verified repository facts (2026-10-26)

- `src/server.ts` implements protected-resource discovery routing.
- `src/routes/mcp.ts` defines an MCP authentication challenge.
- `scripts/credential-broker.mjs` supports `OPEN_CONNECT_CREDENTIAL_RESOLVER` and isolated child-process environment construction.
- `credentials/environment-contract.json` has **no Proton Pass or Proton Drive profiles/bindings**.
- `scripts/credential-broker.test.mjs` is included in `npm run test:credentials`.
- Open-Connect provider inspection returned no Proton connection. A marketplace package is not proof of an executable connection.
- Zeabur project service discovery showed the main Open-Connect service and gateway running, while `open-connect-web` was suspended. Do not assume the suspension causes Proton failures.

## Implementation gates

1. **Identify actual executors.** Determine whether Proton Pass and Proton Drive use a local CLI/stdio transport, approved hosted API, or another supported connector. Record executable, runtime host, account model, required secret *names* (never values), and supported read-only operations.
2. **Define least-privilege credential profiles.** Only after confirming executor contracts, add `credential://proton-pass/<purpose>` and `credential://proton-drive/<purpose>` references and their environment-variable bindings to `credentials/environment-contract.json`. Do not guess authentication variables or copy a vault export.
3. **Validate trust boundaries.** Only the trusted resolver and intended executor may access material; do not place credentials in MCP tool arguments, UI responses, client-side environment variables, source control, CI logs, or agent sandboxes. Review `resolverEnvironment()` forwarding of `PROTON_PASS_KEY_PROVIDER` and `PROTON_PASS_ENCRYPTION_KEY`.
4. **OAuth 2.1 resource-server checks.** Verify discovery metadata, PKCE S256, exact `resource`/audience binding, issuer identification when advertised, scope checks on each request, and valid per-tool `securitySchemes` plus `mcp/www_authenticate` challenge for tool-level linking. Do not assume that ChatGPT-to-Open-Connect OAuth authenticates Proton.
5. **Account isolation.** Bind every executor invocation to the validated Open-Connect principal and a single authorized Proton account. Add a read-only profile tool with stable opaque ID if multiple account links are supported.
6. **Fail-closed tests.** Test missing resolver, stale provider session, wrong audience, missing scopes, expired token, cross-account access, resolver nonzero exit, malformed JSON, and secret redaction. Verify read-only Pass and Drive calls using approved test accounts.
7. **Deployment.** Run `npm run test:credentials`, OAuth/MCP tests, build, and service health checks. Deploy only the reviewed Proton executor changes; keep unrelated services untouched. Confirm runtime, authentication, and audit evidence before marking ready.

## Operational safeguards

Preserve existing credentials and connection IDs. Never restart or unsuspend unrelated services as a speculative fix. Do not mark any step complete without corresponding test or deployment evidence.
