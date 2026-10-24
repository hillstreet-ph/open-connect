# Canonical reusable-resource consolidation

Canonical repository: **https://github.com/hillstreet-ph/open-connect**. Keep new product work,
resource maintenance, releases, and migration evidence here. The two source repositories are
provenance/recovery sources, never new runtime dependencies.

## Verified source snapshots

| Repository / revision                                                         | Pinned commit                              | Scope                                       |
| ----------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------- |
| `v1-open-connect` main                                                        | `85a69bf42892b00d063087295d0287f64c5a077b` | All 556 tracked files inventoried           |
| `open-custom-skills` main                                                     | `05680a40658a5e4173605819e98b3971aa9c9335` | All 14 tracked files inventoried            |
| `open-custom-skills` branch `codex/openconnect-marketplace-skills-2026-10-04` | `0e57ba93a2bf7326655653a053b891b5033e2926` | 29 differing files inventoried against main |

The historical inventory described custom skills as private; live GitHub metadata now reports
both source repositories public. The user explicitly authorized public copies of reviewed custom-skill documents and
prompt-library content on 2026-10-24. That authorization is recorded in
`config/resource-migration.sources.json`; it does not invent a license for unspecified content.

## What is preserved in Open-Connect

- 51 V1 skill entrypoints declaring MIT, with 139 permitted text documents in total, under
  `resources/migrated/v1-skills/`. Original bytes, frontmatter, attribution and hashes are retained.
- All 12 custom-skill ZIP archives, plus their 499 reviewed document members and manifests,
  under `resources/migrated/custom-skills/`. Archive contents are document/configuration examples,
  not automatically executed programs. Required custom-skill package dependencies resolve.
- Four additional branch-only skills and their supporting text: 26 documents under
  `resources/migrated/custom-skills/branch-skills/`. Two shell scripts and one SVG were excluded.
- The original 603-page prompt-library PDF, byte-for-byte, at
  the content-addressed path listed in `config/resource-migration.downloads.json`. Structural review found no active
  JavaScript, external-file actions, embedded files, automatic actions, forms or rich-media actions.
  Its Google Docs export has duplicate named-destination warnings; source bytes were not rewritten.
- 389 literal legacy catalog seed rows (326 table/slug identities) in
  `resources/migrated/v1-catalog.json`. Historical versions remain separate. One token-bearing MCP prompt field is excluded with
  hash-only redaction evidence. No legacy SQL, DDL,
  OAuth implementation, API key or RLS policy was executed or merged into production.

`config/resource-migration.lock.json` records all **599 file decisions**, **678 artifact hashes**,
**68 resource candidates**, source commits, exact-content comparisons and excluded support files.
Same slug/name means review is required; it is not proof of content equality. The live comparison
used 867 canonical catalog records. No existing resource IDs, ownership, review state or package
Storage paths were overwritten. New candidates remain review-only, unpublished and unverified.

The current published custom-package entries have no stored package and previously downloaded a
metadata Markdown fallback. Their authenticated download path now resolves the 12 original ZIPs
and prompt PDF from the canonical repository, using the generated 13-entry download registry.
Stored packages still take precedence. Unverified, private and unrelated entries keep their
existing behavior. SHA-256 is included with canonical package downloads. The URLs include their content hash, and
versioned archives are append-only. Older deployments and rollbacks retain their exact bytes;
the lock and CI bind each artifact to its reviewed hash.

## Deliberate exclusions

- One stock-data package (six documents) contains an opaque API-token-like literal. Its value was
  not reproduced in the report, imported files, logs, issues or PR. The whole package is excluded.
- 191 files lack a reviewed entrypoint/license disposition or belong to restricted packages,
  including skill material with explicit reproduction restrictions. MIT is never inferred for them.
- 39 executable, shebang or binary support files were excluded. Some preserved documents refer to
  those scripts/assets. `excluded_support` records the gaps: do not present those candidates as
  installable or claim that their original runtime works.
- 159 legacy app/configuration files were not ported. The existing TanStack app, `/mcp`, resource
  API, auth/RLS, credentials and provider implementations remain authoritative. Legacy MCP
  search/get/list functionality already has canonical equivalents; a second legacy server is not
  deployed. Unknown catalog runtimes are metadata, not executors.

## Reproduce and maintain

Regeneration requires the exact pinned checkouts, an authorized live catalog metadata export,
Python 3.12+, and the pinned parser requirements. Never execute source scripts or SQL.

```bash
python3 -m pip install -r scripts/resource-migration-requirements.txt
python3 scripts/consolidate_resources_test.py
python3 scripts/consolidate_resources.py --write \
  --v1 /path/to/v1-open-connect \
  --custom /path/to/open-custom-skills \
  --catalog /path/to/current-catalog.json
python3 scripts/consolidate_resources.py
```

The final command verifies every artifact and download mapping **offline**, without either source
repository. CI runs it on the canonical repository. The old source-cloning inventory workflow is
replaced with offline consolidation integrity tests, so removing a source does not break normal
canonical checks. Regeneration prunes only unchanged files owned by the previous lock; changed
files require manual review rather than deletion. Do not hand-edit generated artifacts.

For a future refresh: inventory source branches, review permissions/licenses/secrets, update source
pins, regenerate, inspect the diff, independently review content, run checks and merge a PR.
Do not silently promote candidate metadata or overwrite verified catalog content.

## Deletion readiness: NOT READY

Both source repositories remain intact. This migration does not authorize deleting them.

- [x] Canonical selected content is preserved with source/destination hashes.
- [x] Available alternate source refs compared; four branch-only skills recovered.
- [x] Local Git bundles created for all fetched refs; bundle verification, restore-clone and full
      Git integrity checks passed. The V1 bundle has 16 refs and custom-skills bundle has 5 refs.
- [ ] Save tested bundles to durable owner-controlled private backup storage. Workspace files are
      recovery artifacts for this session, not proof of durable retention.
- [ ] Disposition restricted/unlicensed files, the token-bearing package and excluded runtime
      support. Preserve only through an authorized backup or approved replacement; never publish secrets.
- [ ] Inventory and preserve any required GitHub issues, PR discussions, releases/assets, wiki,
      Git LFS objects, deployment configuration and repository settings. Git bundles do not contain these.
      Live metadata shows no releases and wikis disabled in either source. V1 has two PR records
      (one open); custom skills has one open PR. Their discussion/history preservation remains separate.
- [ ] Check live consumers, installed plugins/skills, webhooks, CI, provider callbacks and download
      links for dependencies on either source repository. A successful source migration does not
      establish that these integrations can survive deletion.
- [ ] Review and adapt selected candidates' licenses, dependencies and execution before publication.
- [ ] Obtain explicit deletion approval after the retirement checklist is complete.

Track remaining retirement work in GitHub issue #362. `deletion_ready` deliberately stays false.
