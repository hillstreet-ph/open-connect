# Resource Consolidation Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task. The user authorized autonomous implementation; do not pause for routine execution choices.

**Goal:** Preserve useful reusable content from V1 and custom skills in canonical `hillstreet-ph/open-connect`, with reproducible comparisons and honest deletion readiness.

**Architecture:** Parse legacy SQL as data without executing it. Copy reviewed document-only skill packages with exact hashes; preserve original custom archives and PDF after the user's explicit public-copy authorization. Keep provenance and unresolved dependency/license decisions in a generated lock report. Existing runtime, ownership, credentials and published resource IDs remain authoritative.

**Tech Stack:** Python 3, pinned pglast SQL parser, Node tests, existing TanStack/Supabase resource download flow.

**Spec:** User's repository consolidation request and `docs/V1_RESOURCE_MIGRATION.md`.

## Global Constraints

- Canonical repository: `https://github.com/hillstreet-ph/open-connect`.
- No source repository deletion or legacy SQL execution.
- No secrets, executable upstream files, restricted-license packages, or automatic verification/publication.
- Source heads and every imported artifact carry SHA-256 provenance.

## Review Focus

- Reject ZIP traversal, symlinks, duplicate paths and executable members.
- Fail closed on unparsed SQL values, exposed credentials and modified source revisions.
- Keep private-to-public approval explicit; do not infer a license.
- A matching slug or title is only a review candidate, not content equality.
- Retain excluded/history/deployment blockers in deletion readiness.

### Task 1: Reproducible importer and evidence

**Files:** `scripts/consolidate_resources.py`, `scripts/consolidate_resources_test.py`, `config/resource-migration.sources.json`, `config/resource-migration.lock.json`, `resources/migrated/**`.

- [x] Test hostile archives, unsafe content, SQL literal decoding and missing licenses.
- [x] Implement pinned-source inventory, selected text copies, archive preservation and metadata-only SQL exports.
- [x] Generate artifacts and verify every destination hash offline.
- [x] Compare with live catalog metadata without overwriting existing resources.

### Task 2: Canonical downloads and maintenance

**Files:** resource download helper/server function and tests, CI workflow, `AGENTS.md`, migration documentation.

- [x] Test canonical URL mapping and conflict isolation.
- [x] Route mapped published resources to canonical versioned artifact URLs.
- [x] Run offline integrity checks in CI; document regeneration and retirement gates.
- [ ] Review, validate, PR, merge, deploy and record remaining deletion blockers.
