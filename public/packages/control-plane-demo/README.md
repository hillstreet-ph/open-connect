# Open-Connect Control Plane — End-to-End Demonstration

## Realistic user prompt

> I operate Open-Connect for HillStreet. Give my `release-manager` agent access in **staging** to discover and invoke approved models, run an isolated terminal for CI diagnostics, use a browser only on GitHub and the staging site, and query deployment status through a structured connector. The agent must never receive raw credentials. Production deployments, deletion, billing, security changes, and account changes must pause for my explicit approval. Produce the policy, approval behavior, audit evidence, and validation report without changing production.

## Outcome

This demonstration converts the prompt into a policy package, approval contract, audit evidence, and local validation report for the Open-Connect control plane.

## Contents

- `control-plane.yaml` — tenant/actor/agent/environment policy with deny-by-default grants
- `test-cases.yaml` — allow, deny, and approval-required scenarios
- `audit-events.jsonl` — redacted example decision evidence sharing one correlation ID
- `validate_demo.py` — deterministic local policy and invariant validator
- `validation-report.md` — configured/validated/pending/blocked status

## Run

```bash
python validate_demo.py
```

## Marketplace

Published on Open-Connect as **Control Plane E2E Demo** (skill). Sign in to download the full zip package from the marketplace.
