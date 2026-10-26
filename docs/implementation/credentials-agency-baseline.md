# Credentials and AI Agency implementation baseline

Verified 2026-10-27 (Asia/Manila). This is a gap register, not a completion certificate.

## Evidence and current boundaries

| Area                 | Evidence                                                                                                | Remaining acceptance criteria                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Vault                | Existing credential_secrets table and Vault resolver migration; live RLS enabled                        | Exercise encryption, key rotation, recovery, revocation and scoped provider validation with synthetic fixtures; RLS presence alone does not prove isolation                    |
| Credential imports   | Existing CSV preview helper; PR #459 merged design documentation                                        | Verify persistence, JSON/XLSX/Sheets/ZIP parsers, bounded processing, duplicate review, rollback and audit; coordinate existing import-security work instead of duplicating it |
| Teams                | ai-agency.ts validates six categories and 2–6 unique roles; ai-agency.server.ts scopes queries by owner | Real two-tenant database tests, durable workflow/task execution and scoped grants                                                                                              |
| Engineering registry | PR #460 merged config/ai-agency.engineering.json; explicitly proposal_only                              | Persistent definitions/instances, verified runtime adapters and UI binding; do not stuff eight agents into a six-role team                                                     |
| Proposal runs        | ai-agency.functions.ts writes autonomous_runs; live table has RLS and owner SELECT policy               | No external tool dispatch is implemented here; retries, cancellation, approval-bound execution and durable workers need separate implementation                                |
| Run completion       | finishAgencyProposalRun now requires owner, running state, Agency executor and an actual returned row   | CI and deployment verification for this change; this is atomic finalization, not a durable orchestration engine                                                                |
| Browser              | PR #458 closed without merge; Playwright cutover now present on main                                    | Verify deployed worker, persistent profile isolation, runtime bindings and browser smoke evidence; do not infer readiness from files                                           |
| MFA/passkeys         | Not verified in this checkpoint                                                                         | Inspect supported provider lifecycle, step-up protection and recovery before claiming support                                                                                  |

Live read-only catalog inspection of the existing open-platform project found only ai_agency_teams among tables named with agency. autonomous_runs, ai_agency_teams and credential_secrets all have RLS enabled. Catalog inspection returned no secret values. No production schema, auth configuration or policy was changed.

## Security order

1. Verify vault isolation and lifecycle, including imports and redaction.
2. Implement persistent agent instances and versioned workflow/task state using existing entities where possible.
3. Introduce deny-by-default tool and credential grants with resource, owner, environment, expiration and revocation checks outside the model.
4. Bind approvals to exact operations and revisions before provider invocation. Resolve credentials only inside approved adapters.
5. Exercise synthetic end-to-end allow/deny/revoke scenarios, then release through required CI and approval gates.

The existing proposal runtime must remain labeled as proposal-only. A generated plan, catalog match, registry entry or successful model reply is not evidence of provider execution. Preserve current UI, connections, credentials and the two-to-six role contract.
