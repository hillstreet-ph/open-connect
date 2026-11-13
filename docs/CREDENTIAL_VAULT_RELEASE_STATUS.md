# Credential vault release evidence

Verified 27 October 2026 (Asia/Manila). Overall import release: NO-GO.

## Foundation and authorization boundary

Repository and root AGENTS.md reviewed on main 7e3e0b0. Existing credential creation,
folders, projects, reveal, TOTP and deletion controls are retained. A local-only
CSV/flat JSON dry-run panel is added; it cannot save or replace credentials.

| Actor | Metadata RPC | Owner reveal/edit | Direct vault tables | Credential broker |
| --- | --- | --- | --- | --- |
| Anonymous | Denied | Denied | Denied | Denied |
| Authenticated owner | Own items | Own items only | Denied | Denied |
| Other authenticated identity | No foreign items | Denied | Denied | Denied |
| Trusted service role | Authorized server work | Existing server policies | Server only | Owner-bound server calls |

This is the implemented permission matrix, not an assertion of independent security approval.
Threats include RPC grant drift, cross-owner access, preview leakage, oversized files,
unsafe archives, accidental duplicate replacement and secret-bearing provider errors.

## Live database evidence

Project open-platform (huadtiuuoiriqrjpjxhr): 54 credential rows, all 54 linked to
Supabase Vault, zero plaintext values in the legacy secret_value column. No secret
values were selected for this audit. This does not prove key recovery or rotation.

Production inspection found broad table and function grants had drifted from the
repository's intended boundary. Migration 20261026190852 restores explicit owner
RPC access, denies anonymous RPCs and direct client table access, and limits broker
and service credential functions to service_role. RLS and existing owner predicates
are retained. No credential contents, owners, keys or provider scopes changed.

Live privilege readback passed: table_boundary_ok, anonymous_rpc_denied and
broker_service_only. Transactional negative tests passed for anonymous listing and
table access, unrelated-user metadata listing, signed-in direct table reads,
non-service broker execution and a missing credential reveal. These checks do not
constitute full multi-tenant CRUD or staging acceptance testing.

Security advisors still report project-wide warnings, including leaked-password
protection disabled and a mutable search_path on platform.set_updated_at. GraphQL
visibility warnings must be assessed with grants and RLS; schema visibility alone
is not evidence that secret values were exposed. Unrelated schema grants were not
changed. See Supabase Dashboard security advisors for the current findings.

## Imports

CSV and flat JSON dry-run parsing are bounded by bytes, rows and cell size. Preview
masks accounts, omits secret fields, reports duplicate/known identities and embedded
URL credentials, and does not merge case-sensitive account names. File input is
cleared after selection; raw bytes/text are transient local variables, never
uploaded, logged, or placed in query cache/localStorage. Garbage collection is not
guaranteed secure memory erasure. Nested JSON, ZIP and Sheets are unsupported.

## Remaining release gates

- Encrypted atomic/idempotent batch commit, server-side validation, rate limits,
  CSRF review, per-batch confirmation and audit events are not implemented.
- Google Sheets least-privilege selection/import and adversarial ZIP validation
  are not implemented. No actual credential exports were imported.
- Vault key lifecycle, provider revocation, audit coverage, MFA/passkey acceptance,
  Android Chrome and authenticated staging UI tests remain unverified.
- Supported MCP/OAuth accounts require individual functional checks; connection
  status alone is not acceptance evidence.
- Independent security approval, complete staging acceptance, production app
  deployment SHA, monitoring and hosting rollback exercise remain outstanding.

## Rollback and containment

There is no enabled bulk-import writer to disable. Revert the preview UI commit
through a normal reviewed revert if it regresses. Keep the permission hardening;
regranting broad client access is not a safe rollback. If a legitimate consumer
fails, identify its exact RPC/role and repair only that permission in a new
migration, then rerun the boundary checks. Never edit applied migrations.
