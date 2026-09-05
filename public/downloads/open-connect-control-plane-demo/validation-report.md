# Validation report

Correlation ID: `oc-demo-20260822-001`

## Configured

- Tenant-, actor-, agent-, and environment-bound policy.
- Deny-by-default capability grants for staging models, terminal, browser, deployment-status connector, and audit query.
- Opaque vault references; no credential values.
- Time-bounded, single-action, one-time approval contract.
- Redacted append-only audit event schema.
- Runtime selection and isolation constraints.

## Validated locally

- YAML parses and credential references match the `vault://provider/environment/account` contract.
- Default deny, reference-only credentials, append-only audit, and one-time approval invariants hold.
- Ten of ten policy cases passed, covering allowed operations, wrong command/domain, secret access, cross-tenant access, production writes, and destructive actions.
- The skill bundle validator checks structure, metadata, policy invariants, model discovery rules, and credential-shaped content.
- The demo artifact scan found no credential-shaped values.

## Pending live validation

- Positive and negative OIDC authentication.
- Live model discovery, invocation, budget enforcement, and usage metering.
- E2B terminal/desktop lifecycle, filesystem isolation, egress controls, TTL, and cleanup.
- Browser profile/cookie/download isolation and human authentication handoff.
- Structured connector scope enforcement.
- Approval approve/deny/expire/replay behavior against a real service.
- External append-only audit immutability and alerting.
- Health, quotas, backup catalog, restore drill, and emergency revocation.

## Blocked

- Live deployment and provider conformance: no authenticated Open-Connect MCP/API endpoint or provider bindings are exposed in this session.
- Production changes: intentionally not requested or approved.

## Completion decision

The policy package is **configured** and its static/local behavior is **validated**. The control plane is **not live-validated** and must not be described as deployed until the pending evidence is produced against authenticated services.
