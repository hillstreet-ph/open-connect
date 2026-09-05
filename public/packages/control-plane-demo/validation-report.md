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
- Ten of ten policy cases passed.
- Demo artifact scan found no credential-shaped values.

## Pending live validation

- Positive and negative OIDC authentication.
- Live model discovery, invocation, budget enforcement, and usage metering.
- Connector scope enforcement and approval lifecycle.

## Completion decision

The policy package is **configured** and its static/local behavior is **validated**. Live control-plane validation remains pending against authenticated Open-Connect services.
