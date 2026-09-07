# CI/CD Workflow Analysis

**Repo:** hillstreet-ph/open-connect  
**Workflows on main:** 7  
**Rule:** Audit before consolidating; do not add parallel pipelines first.

## Inventory

| Workflow file | Purpose | Trigger | Notes |
|---------------|---------|---------|--------|
| `ci.yml` | Build + production smoke | push/PR main & development | **KEEP** canonical validator |
| `control-plane-ci.yml` | Control-plane specific checks | (inspect) | Likely **MERGE** into ci or keep narrow |
| `pr-review.yml` | PR review automation | PR events | **KEEP** if non-duplicative |
| `release.yml` | Tag + GitHub Release | workflow_dispatch | **KEEP** |
| `auto-merge-development.yml` | Promote development → main PR + squash merge attempt | after CI success on development | **REFACTOR** — repo auto-merge setting may be disabled |
| `fixer-redeploy.yml` | Fixer + redeploy | (inspect) | Overlap risk with self-heal |
| `self-heal-production.yml` | Probe health; open incident issues | schedule/dispatch | **KEEP**; coordinate with fixer |

## Known inconsistency

- Workflow **attempts** merge development → main.
- GitHub repo settings may have **auto-merge disabled** and **delete branch on merge disabled**.
- Resolve **config vs workflow** before enabling more autonomy.

## Decision targets

| Action | Item |
|--------|------|
| KEEP | ci.yml, release.yml, self-heal-production.yml |
| INSPECT then MERGE or NARROW | control-plane-ci.yml vs ci.yml |
| INSPECT then MERGE or SEPARATE | fixer-redeploy.yml vs self-heal |
| REFACTOR | auto-merge-development.yml + branch protection alignment |
| DO NOT CREATE | Second full CI suite |

## Branch model (observed)

Permanent: `main`, `development`  
Also present: many `ai-feat/*`, `ai-fix/*`, `release/v1.0.0`, `superseded`, `feature/open-connect-control-plane`  

Archive/supersede stale `ai-*` branches after confirming content is in main (branch `superseded` already exists).

## Production deploy path (actual)

```text
push main → Cloudflare Pages (open-connect-app) → open-connect.site
```

Zeabur is optional runtime, not the public edge source of truth.
