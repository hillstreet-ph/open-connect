# Provider Authentication and MCP Connectors Implementation Plan

> **For agentic workers:** Use the host's available task-by-task implementation workflow. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Implement documented Proton connector paths and interoperable MCP identity/authorization for ChatGPT and Claude while preserving provider account isolation.

**Architecture:** Reuse existing Custom MCP/OpenAPI transport, Vault storage and connection grants. Add an isolated official-CLI executor for Proton, with metadata-only Pass reads and explicit write confirmation. Bind newly issued OAuth grants to the MCP resource and provide a stable authenticated profile.

**Tech Stack:** TypeScript, Node MCP SDK, official Proton CLIs, Supabase/Postgres, Bun, Cloudflare Pages.

## Global Constraints

- Keep canonical Open-Connect and existing connection IDs/credentials. Do not create duplicate accounts or broaden saved grants.
- No invented Proton public OAuth endpoints, plaintext vault export, passwords/tokens in MCP arguments/responses, arbitrary shell execution, unsafe Drive session stores or blanket provider-administrator claims.
- User account selection, MFA and native provider consent must use the provider's supported UI. Missing consent/executor readiness remains explicit.
- Preserve applied migrations and published Git history. New resources/skills remain review-only until independently verified.

---

### Task 1: Proton executor and connection setup

**Files:** Create `services/proton-mcp/` implementation/tests/runbook; modify observed `src/lib/remote-mcp.ts`, `src/lib/connections.functions.ts`, connection UI and credential contract; test existing connection suites plus executor tests.

**Interfaces:** Existing MCP connection endpoint/token configuration consumes a trusted per-account executor URL. Executor consumes supported official CLI browser/PAT sessions on its own isolated host; returns allowlisted metadata and bounded command results. Session/keychain data never travels through the browser or model.

- [x] Add failing tests for fixed command argument arrays, output allowlists, missing/expired session, provider/account mismatch, unsupported command, forbidden plaintext session store and denied writes.
- [x] Implement fixed Proton Pass/Drive operations from the official current command contracts; no caller-supplied executable/flags. Keep secrets out of stdout/errors and audit metadata.
- [x] Add named connector setup paths that require an approved endpoint, distinguish bridge authentication from provider login and keep status unverified until an actual handshake.
- [x] Run executor tests and connection suites; commit the passing deliverable.

### Task 2: AI app connection and administrator boundaries

**Files:** Reuse `src/components/universal-connector-dialog.tsx`, `src/lib/openapi-connector.ts`, provider catalog and plugin packages; add reviewed setup templates and tests only where missing.

**Interfaces:** ChatGPT/Claude connect inward to the existing Open-Connect MCP endpoint; provider APIs connect outward using their documented credentials and available managed toolkits. Organization administration requires a separately authorized provider admin credential.

- [x] Verify current official authentication and API contracts; retain existing OpenAI/Anthropic connections and test a bounded metadata/model read through supported tools.
- [x] Add truthful setup presets/templates for API versus MCP/host connections; never imply API keys grant consumer chat history or universal app control.
- [x] Test preset URLs/auth headers/read/write annotations and rejection of unsupported OAuth/credential forwarding.
- [x] Commit independently passing setup changes and record account-specific activation blockers.

### Task 3: MCP OAuth and stable profile interoperability

**Files:** Modify `src/lib/oauth-policy.ts`, `oauth.server.ts`, gateway verification, OAuth routes/consent UI, `src/routes/mcp.ts`, static discovery documents and focused tests; create one CLI-generated follow-up migration and SQL regression test.

**Interfaces:** `resource` is the exact canonical MCP identifier; missing resource retains the documented canonical default. Code issuance/redemption binds the resource in the database; gateway verification enforces it. `get_profile` accepts no account selector and returns the authenticated immutable opaque user ID. OAuth response issuer metadata is advertised only with matching redirect behavior. DCR/public PKCE stays supported; CIMD/private-key JWT is not falsely advertised.

- [x] Record failing request/response tests for wrong resource, replay, wrong client/redirect/verifier, expired grants, missing scopes, scope upgrades and stable per-account profile output.
- [x] Preserve existing authentication/role checks; use explicit code/key columns and compatibility wrappers for old RPC callers. Newly bound OAuth tokens cannot cross resource surfaces.
- [x] Add structured tool-level authentication challenges and explicit profile metadata without changing provider grants or exposing identity from unvalidated credentials.
- [ ] Finish final lint/types/build/SSR, independent review, CI, merge and exact production verification. Unit/HTTP and disposable SQL fixtures already pass.

## Decisions and completion limits

Use documented browser login and scoped Pass PATs; provider scopes and manager/admin privileges remain provider-enforced. Run CLIs only on an approved isolated host with encrypted native session storage. Live activation requires that host and the owner's native provider consent; neither metadata nor mocked tests can replace them. The optional user question distinguishes host MCP connection setup from organization administration; independent OAuth/Proton work continues while awaiting it.

## Validation and operational limits

Implemented the fixed CLI adapter, HTTPS MCP connector paths, supported API templates, OAuth resource binding, issuer callbacks, stable profile and standard tool-level auth errors. Unit/HTTP integration and disposable PostgreSQL fixtures verify these contracts. Live Proton executor provisioning/login and app-side reconnect remain operational activation gates; no production Proton availability or universal provider administration is claimed. Existing Anthropic managed-account list-models check returned provider_authorization_required, so that account needs native reconnection rather than another duplicate. Final CI/deployment evidence is recorded on PR455.
