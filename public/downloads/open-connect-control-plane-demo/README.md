# Open-Connect Control Plane — End-to-End Demonstration

## Realistic user prompt

> I operate Open-Connect for HillStreet. Give my `release-manager` agent access in **staging** to discover and invoke approved models, run an isolated terminal for CI diagnostics, use a browser only on GitHub and the staging site, and query deployment status through a structured connector. The agent must never receive raw credentials. Production deployments, deletion, billing, security changes, and account changes stay denied.

## Contents

| File | Purpose |
|------|--------|
| `control-plane.yaml` | Policy: subject, capabilities, denies, approval, isolation |
| `test-cases.yaml` | Allow/deny matrix for local validation |
| `audit-events.jsonl` | Sample redacted audit stream |
| `validate_demo.py` | Local validator (Python + PyYAML) |
| `validation-report.md` | Expected validation outcome |

## Run locally

```bash
pip install pyyaml
python validate_demo.py
```

## Website placement

- **Not** listed in the public Marketplace catalog.
- Linked from workspace **Guides → Professional setup E2E**.
- Also available as zip: `/downloads/open-connect-control-plane-demo-20260822.zip`

Domain: https://open-connect.site
