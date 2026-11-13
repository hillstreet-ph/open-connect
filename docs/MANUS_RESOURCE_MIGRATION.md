# Manus resource consolidation

Canonical repository: https://github.com/hillstreet-ph/open-connect. Sources are comparison inputs, never runtime dependencies.

| Source | Pinned commit | Inventory | Result |
| --- | --- | --- | --- |
| master-kanor/manus-skills | `48c760280dab4df57951e31057720926b271f530` | 615 tracked entries, including two submodule pointers | Five explicitly MIT-declared skills, 11 safe text documents preserved |
| master-kanor/manuskills | `e8053ae457ac737a43dda4d06a32bb48f211408e` | Two tracked files; 551 snapshot members | 547 exact matches to pinned V1; four configuration differences; no new skill documents |

The four snapshot differences are `.env`, `.gitignore`, `package.json` and `pnpm-lock.yaml`. The ZIP is inventoried in memory, never extracted, executed or copied publicly. Environment values, application code, binaries and nested archives remain excluded. Hashes and comparison paths record the examination without exposing configuration values.

## Preserved documents

Under `resources/migrated/manus-skills/skills/`:

- `development-skills/promo-code-system`: SKILL, quick reference, Stripe integration and implementation guide.
- `integration-skills/voice-ai-integration`: SKILL.
- `tier1-foundation/api-endpoint-builder`: SKILL and API patterns.
- `tier1-foundation/database-schema-generator`: SKILL and schema patterns.
- `tier1-foundation/testing-framework`: SKILL and testing patterns.

Source bytes and namespaces are preserved. Scripts, executable templates and SQL are not imported. Skills referring to excluded support are document references, not complete installable runtimes. Missing licenses are not treated as permission. Restrictive Anthropic material and absent-license packages remain excluded. Submodules are recorded by commit pointer without fetching their repositories.

The combined lock records **five pinned revisions, 1,767 source/member decisions, 689 artifact hashes and 73 candidates**, including the earlier consolidation. The 13 existing canonical ZIP/PDF downloads are unchanged. New candidates remain **unverified, unpublished and non-executable** pending independent content, dependency and publication review.

## Regeneration

Use the existing generator with `--v1`, `--custom`, `--catalog`, plus `--manus /path/to/manus-skills --snapshot /path/to/manuskills --write`. Clones must match `config/resource-migration.sources.json`. Source code is never run. Offline verification:

```bash
python3 scripts/consolidate_resources.py
python3 -m unittest scripts/consolidate_resources_test.py
```

Tests require the pinned `scripts/resource-migration-requirements.txt`; artifact verification uses only Python's standard library.

## Source retirement: NOT READY

No source was deleted or archived. Selected document preservation does not establish complete resource/runtime equivalence. Before deletion:

- Retain full-ref, restore-tested Git bundles in durable owner-controlled private storage; workspace files alone are insufficient.
- Preserve required PRs, issues, release assets, LFS, settings and deployment configuration separately.
- Resolve unlicensed/restricted content, excluded runtime support and submodule dependencies explicitly.
- Check consumers, installed plugins/skills, downloads, CI, webhooks and provider callbacks for source dependencies.
- Complete candidate publication/runtime review and obtain deletion approval after the checklist is complete.

Issue #371 tracks this consolidation; #362 tracks the earlier retirement blockers. The generated `deletion_ready` stays false.
