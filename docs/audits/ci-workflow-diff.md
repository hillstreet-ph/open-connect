# CI workflow diff details

**Repo:** hillstreet-ph/open-connect  
**Date:** 2026-09-10  
**Rule:** Consolidate only after understanding; do not add parallel pipelines.

---

## 1. `ci.yml` vs `control-plane-ci.yml`

| Dimension | `ci.yml` (CI — Validator) | `control-plane-ci.yml` (Control Plane CI) |
|-----------|---------------------------|---------------------------------------------|
| **Role** | App build + production smoke | Python control-plane package tests + Docker build |
| **Triggers** | push/PR `main` + `development`; `workflow_dispatch` | push/PR **path-filtered** to `control-plane/**`, `supabase/migrations/**` |
| **Runtime** | Bun + Vite build | Python 3.12 + pytest; Docker Buildx |
| **Working dir** | repo root | `control-plane/` |
| **Jobs** | `validate` (install, build, artifact); `smoke-production` (main only) | `test` (pytest, compileall); `container` (build, no push) |
| **Prod probes** | health JSON, OAuth discovery, public pages | none |
| **Overlap** | **Low intentional** — different stacks | Not a duplicate of Bun CI |

### Decision

| Item | Action |
|------|--------|
| `ci.yml` | **KEEP** — canonical app validator + post-merge smoke |
| `control-plane-ci.yml` | **KEEP** (narrow) — only when `control-plane/` or migrations change |
| Merge into one file? | **No** — different language/toolchains; path filters already prevent redundant runs |

---

## 2. `fixer-redeploy.yml` vs `self-heal-production.yml`

| Dimension | `fixer-redeploy.yml` | `self-heal-production.yml` |
|-----------|----------------------|----------------------------|
| **Role** | Force Cloudflare Pages rebuild | Continuous production probe + incident issues |
| **Triggers** | `workflow_dispatch` only | Hourly cron `0 * * * *` + `workflow_dispatch` |
| **Action on failure** | Empty commit on `main` → Pages deploy | Open/update GitHub issue (`self-heal`) |
| **Permissions** | `contents: write` | `issues: write`, `contents: read` |
| **Probes** | none (assumes human/dispatch) | health, OAuth well-known, `/`, `/auth` |
| **Auto-redeploy?** | Yes (empty commit) | **No** — report only |
| **Overlap** | Complementary, not duplicate | Complementary |

### Decision

| Item | Action |
|------|--------|
| `self-heal-production.yml` | **KEEP** — observe/report |
| `fixer-redeploy.yml` | **KEEP** — manual heal only |
| Auto-chain heal → fixer? | **Do not enable yet** — empty commit to main is high-impact |

Smoke in `ci.yml` (post-merge) vs hourly self-heal: intentional partial overlap. Acceptable.

---

## 3. `auto-merge-development.yml`

| Behavior | Detail |
|----------|--------|
| Trigger | After **CI — Validator** succeeds on `development`; or manual dispatch |
| Action | Create PR `development` → `main`, then **attempt squash merge** via API |
| Risk | Bypasses human review if branch protection is weak; fails if required checks block |

**Evidence (2026-09-10):** Direct push to `main` was rejected: *Changes must be made through a pull request. Required status check "Build & validate" is expected.* Branch protection is **active**.

### Decision

| Item | Action |
|------|--------|
| Workflow | **REFACTOR**: open/update promotion PR only; remove automatic `pulls.merge` (or gate on explicit `force`) |
| Required check | Status name **Build & validate** (job in ci.yml) |

---

## 4. Other workflows

| Workflow | Decision |
|----------|----------|
| `release.yml` | **KEEP** — manual SemVer tag + GitHub Release |
| `pr-review.yml` | **KEEP** — advisory comments only |

---

## 5. Consolidation matrix

| Workflow | KEEP | REFACTOR |
|----------|------|----------|
| ci.yml | ✓ | |
| control-plane-ci.yml | ✓ path-scoped | |
| self-heal-production.yml | ✓ | |
| fixer-redeploy.yml | ✓ manual | |
| release.yml | ✓ | |
| pr-review.yml | ✓ | |
| auto-merge-development.yml | | ✓ stop auto-merge API |

**Do not create** a second full Bun CI suite.

---

## 6. Next safe implementation batch

1. PR from `development`: this doc + soften auto-merge (PR-only).  
2. Confirm required check **Build & validate** on main.  
3. Leave control-plane CI and heal/fixer unchanged.
