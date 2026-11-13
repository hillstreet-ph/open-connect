# Autonomous operations policy

This repository uses guarded autonomy: the automation may triage failures, create issues, propose fixes and enable native auto-merge only for explicitly eligible low-risk changes.

## Decision gates

1. CI, security checks, and branch protection remain authoritative. A bot must not create substitute approvals or bypass required reviewers.
2. Dependabot auto-merge is restricted to single patch-version updates touching package manifests and lockfiles only. Native GitHub auto-merge waits for required checks and approvals.
3. Workflow, infrastructure, credentials, access control, database migrations, and production configuration changes require review.
4. Exact duplicate PR heads are reported, not deleted. Similar changes require diff and intent review.
5. Production monitoring reuses `self-heal-production.yml` and `hourly-autonomous-audit.yml`; no additional health watcher is installed. Production deployment must use the existing protected deployment mechanism. The health watcher reports incidents but does not roll back without a verified release artifact and target.
6. Failed CI creates a triage issue with job links. Automated fixes should use isolated branches and PRs, never direct pushes to main.
7. Every decision should be attributable to a workflow run and commit SHA.

## Required end-to-end verification before merge

- Validate workflow YAML syntax and event permissions.
- Exercise Dependabot eligibility with positive and negative fixtures.
- Verify the CI workflow completes on the latest head SHA.
- Confirm branch protection and required reviewers remain enforced.
- Test production health monitoring against healthy and intentionally invalid fixtures.
- Confirm deployment credentials, target environment and rollback release identifiers.
- Verify staging and production smoke checks.
