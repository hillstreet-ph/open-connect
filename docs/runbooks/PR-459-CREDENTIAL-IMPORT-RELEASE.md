# PR 459 — Credential Import Release Runbook

## Metadata
- **Status:** Draft
- **Owner:** Open Connect engineering
- **Operator:** Authorized repository maintainer / release operator
- **Go/no-go owner:** Open Connect production administrator
- **Last verified:** 2026-10-26
- **Environment:** GitHub PR, staging, production
- **Expected duration:** Unknown until tests and staging environment are available
- **Change/incident ID:** PR #459
- **Runbook revision:** 1 (draft)
- **Target artifact:** hillstreet-ph/open-connect PR #459, commit 017dc22451471e06934ce087b0d1bc5f07b42312 (reverify SHA before use)

## Objective
Safely validate and release credential-import changes only after the complete functionality and security controls are implemented and verified. Prevent deployment of untested credential-handling code.

## Scope
**Included**
- CSV import preview, secure vault integration, Google Sheets and ZIP imports, TOTP and WebAuthn authentication, Composio reference integration.
- CI, staging, merge, deployment and rollback gates.

**Excluded**
- Importing actual user credentials during validation.
- Bulk passkey private-key import or MFA bypass.

**Must remain unchanged**
- Existing encrypted credentials, user accounts, live auth sessions, vault access controls, and applied migrations.

## Preconditions
- **Entry signal:** PR #459 is proposed for release.
- **Entry verification:** Check exact PR head SHA, required GitHub checks and implementation completeness. Current candidate fails CI and is NOT releasable.
- [ ] CI lint, tests, typecheck, build and SSR all pass for exact candidate.
- [ ] Security review of import and vault boundary completed.
- [ ] Staging uses synthetic credentials only; restore/disable path verified.
- [ ] Production owner confirms rollout window and authorization.

## Risk and stop conditions
- **Risk:** Credential leakage, cross-tenant access, broken authentication, unreviewed migration, or application outage.
- **Stop immediately if:** CI fails; credentials appear in logs; access control fails; production health regresses; deployed commit differs from approved candidate.

## Evidence plan
- Record: Commit SHA, workflow/job IDs, sanitized test results, staging and production health checks.
- Store in: PR #459 and release execution record.
- Never record: Secret values, TOTP seeds, passkey private keys, OAuth tokens or personal credential exports.
- Binding: Each check must identify candidate SHA, environment and collection timestamp; code changes invalidate affected checks.

## Procedure
### Phase 1 — Validate candidate
1. **Action:** Inspect current PR head and GitHub Actions; diagnose failing checks without changing production.
   - **Step ID:** S01
   - **Expected result:** Exact failure reason and actionable repair.
   - **Verify:** GitHub workflow 40302930247 shows lint failure; inspect logs and changed paths.
   - **If verification fails:** Hold merge and gather evidence.
   - **Approval required:** Not required (read-only).
   - **Retry safety:** Read-only, retry once if provider temporarily unavailable.

2. **Action:** Fix lint and security findings on feature branch; execute focused tests, then full repository checks.
   - **Step ID:** S02
   - **Expected result:** All required checks pass on same head SHA.
   - **Verify:** GitHub CI reports success for lint, tests, typecheck, build and SSR.
   - **If verification fails:** Stop release; repair on feature branch and rerun.
   - **Approval required:** Existing development authorization applies to scoped branch edits; production actions separate.
   - **Retry safety:** No duplicate commits or reruns without inspecting latest SHA and job outcome.

### Phase 2 — Stage
3. **Action:** Deploy verified candidate to staging with imports disabled by default and synthetic fixtures.
   - **Step ID:** S03
   - **Expected result:** Security and Android Chrome tests pass; rollback verified.
   - **Verify:** Auth, tenant isolation, malicious CSV/ZIP, WebAuthn, TOTP, Composio and vault integration tests.
   - **If verification fails:** Disable feature and stop.
   - **Approval required:** Authorized staging operator; verify current grant.
   - **Retry safety:** Reconcile deployment ID and target digest before retry.

### Phase 3 — Release
4. **Action:** Obtain final go/no-go and merge reviewed PR using protected-branch controls.
   - **Step ID:** S04
   - **Expected result:** Merge commit on main with required reviews and passing checks.
   - **Verify:** GitHub merged status and merge SHA.
   - **If verification fails:** Hold; do not bypass branch protections.
   - **Approval required:** Production go/no-go owner; required GitHub reviewers.
   - **Retry safety:** Inspect PR state before any retry; never merge twice.

5. **Action:** Deploy the exact approved merge commit and monitor.
   - **Step ID:** S05
   - **Expected result:** Production reports healthy; feature remains disabled until controlled activation.
   - **Verify:** Deployment ID, commit SHA, health checks, error rates and credential-security audit.
   - **If verification fails:** Trigger rollback/containment.
   - **Approval required:** Production deploy authorization.
   - **Retry safety:** Reconcile provider deployment state before retry.

## Rollback
- **Trigger:** Any secret exposure, cross-tenant access, auth regression, failed health check or sustained production error spike.
- **Decision owner:** Open Connect production administrator.
- **Actions:** Disable import feature flag; revert to last verified deployment using the hosting provider's authorized rollback procedure; preserve audit evidence. Do not reverse applied migrations destructively.
- **Verification:** Compare running deployment ID to last known-good and confirm health/auth checks.
- **Limitations:** Actual hosting rollback commands must be verified against live provider before execution.

## Completion criteria
- [ ] Required CI and security checks pass on approved commit.
- [ ] Full feature requirements verified in staging with synthetic fixtures.
- [ ] PR merged under branch protection and production commit verified.
- [ ] No credential exposure, tenant isolation regressions or authentication failures.

## Communications
- **Start:** Update PR #459 release record.
- **Failure:** Notify responsible engineering and production owner via approved project channel.
- **Completion:** Record deployment ID, verification results and monitoring handoff in PR.

## Record
- **Execution record:** PR #459 release execution log (to be created before release)
- **Started:** Read-only inspection 2026-10-26
- **Completed:** Not completed
- **Operator:** ChatGPT read-only inspection; deployment operator unassigned
- **Approvals:** Development approval only; production go/no-go outstanding
- **Outcome:** NO-GO: lint failure, unimplemented release scope, no production validation
- **Deviations:** No merge or deployment attempted
- **Follow-up:** Fix lint, finish implementation, run CI and staging
- **Next verification:** After next PR commit and CI run
