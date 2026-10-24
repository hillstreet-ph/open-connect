# Manus Resource Consolidation and PR Validation Implementation Plan

> **For agentic workers:** Use the host's available task-by-task implementation workflow. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve reusable permitted Manus documents in canonical Open-Connect and deploy validated PR fixes without merging incompatible updates.

**Architecture:** Extend the existing deterministic importer with pinned Manus sources and safe snapshot ZIP comparison. Keep candidates unpublished and review-only; retain the existing application and database boundaries. Review pending PRs against current main and merge compatible changes through required CI.

**Tech Stack:** Python, Git, Bun, TypeScript, GitHub Actions, Cloudflare Pages.

## Global Constraints

- Canonical repository remains hillstreet-ph/open-connect.
- Never execute source scripts, snapshot application code or legacy SQL; never copy secrets or restricted content.
- Preserve published Git history and applied migrations. Do not delete source repositories.
- All imported candidates remain unverified and unpublished. Exact hashes, exclusions and deletion blockers must be recorded.

---

### Task 1: Deterministic source comparison and permitted document preservation

**Files:** Modify `scripts/consolidate_resources.py`, `scripts/consolidate_resources_test.py`, `config/resource-migration.sources.json`; generate `config/resource-migration.lock.json` and `resources/migrated/manus-skills/**`; create `docs/MANUS_RESOURCE_MIGRATION.md`.

**Interfaces:** `generate(v1, custom, catalog, manus=None, snapshot=None)` consumes pinned clones; `snapshot_members(blob)` produces validated member bytes without extracting or executing files. `verify()` checks the combined artifact set offline.

- [ ] Add failing tests for snapshot traversal, duplicate paths, symlinks, size limits and exact comparison; reject restricted package license overrides.
- [ ] Run `python3 -m unittest scripts/consolidate_resources_test.py` and record relevant missing-interface failures.
- [ ] Inventory every tracked source file and snapshot member. Copy only safe text in explicitly MIT-declared packages, excluding packages with conflicting license terms or secrets. Record identical canonical artifacts without overwriting them. Exclude snapshot environment/runtime files and never copy the entire archive.
- [ ] Run focused tests, regenerate using all pinned clones and catalog evidence, and run the offline verifier. Every selected source/destination hash must match.
- [ ] Review actual selected content independently; preserve all prior archives and review states.
- [ ] Commit the passing deliverable with `feat: consolidate reviewed Manus resource documents`.

### Task 2: Open PR validation and compatible fixes

**Files:** Existing PR branches and their exact changed files; create `docs/audits/2026-10-24-pr-validation.md`.

**Interfaces:** GitHub PR metadata, review threads, branch diffs and checks produce per-PR merge, superseded or blocked decisions with evidence.

- [ ] Compare each open PR against current main; verify overlapping branch changes before merging.
- [ ] Resolve conflicts with normal commits and regenerated lockfiles. Do not merge unsupported TypeScript/ESLint peer combinations.
- [ ] Complete marketplace review-state fixes with focused regression cases if the draft can be made consistent; otherwise preserve exact blockers.
- [ ] Run application tests, lint, TypeScript, build, SSR, importer tests and offline integrity on the combined result.
- [ ] Obtain independent code review, fix verified findings, push and wait for required CI.
- [ ] Merge validated changes and verify exact production commit, health, OAuth discovery, public pages and artifact checksums. Record remaining issues without marking untested external integrations complete.

## Decisions

Use namespace-preserving document paths and exact-byte deduplication; exclude unsupported files with explicit evidence. Partial success is reported per PR/source, never as universal readiness. No unresolved product decision blocks document-only consolidation; source retirement remains a separate gate.
