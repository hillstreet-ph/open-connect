# Vendored upstream skills

Open-Connect vendors the `SKILL.md` sources of four MIT-licensed upstream agent-skill
repositories into this repository so the marketplace, personal library, and static downloads all
serve one reviewed copy. Nothing in this pipeline installs or executes upstream code; every
package stays metadata-only until a separate security review approves it.

## Vendored sources

| Source                      | Repository                                                  | Vendored path                        | Skills                                                                                   |
| --------------------------- | ----------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------- |
| OpenHands Extensions        | `https://github.com/OpenHands/extensions`                   | `skills/vendor/openhands-extensions` | Official OpenHands skills and plugins.                                                   |
| OpenHands core agent skills | `https://github.com/OpenHands/OpenHands` (`.agents/skills`) | `skills/vendor/openhands-core`       | In-repo agent skills. `OpenHands/openhands` resolves to the same repository.             |
| Manus Skills                | `https://github.com/master-kanor/manus-skills`              | `skills/vendor/manus-skills`         | Community arsenal grouped by tier, workflow, utility, design, analysis, and integration. |
| OpenClaw                    | `https://github.com/openclaw/openclaw`                      | `skills/vendor/openclaw`             | Operator skills, custodian skills, and repository agent skills.                          |

All four upstream repositories are MIT licensed. Only non-executable source text is vendored:
prompt bodies, references, assets, and JSON/YAML manifests. Executable upstream code — anything with
a script extension (`.py`, `.js`, `.mjs`, `.ts`, `.tsx`, `.sh`, …) or a `#!` shebang — is
intentionally excluded. The marketplace serves `SKILL.md` only, so vendoring third-party scripts
would ship unreviewed code and trip CodeQL against first-party paths. Binary assets (fonts, images,
PDFs, Office ISO schemas) are excluded for the same reason.

## Pipeline

```
config/vendored-skills.manifest.json   # source of truth: repo, license, path, category mapping
        │  npm run skills:generate
        ▼
skills/vendor/**/SKILL.md              # vendored upstream sources
config/vendored-skills.generated.json  # marketplace catalog (metadata only)
public/downloads/skills/<slug>/SKILL.md# static download package
supabase/migrations/20261006000000_vendored_upstream_skills.sql  # published catalog rows
```

- `npm run skills:generate` rebuilds the catalog, the static download packages, and the migration
  from the manifest. It is idempotent and safe to re-run.
- `npm run skills:validate` fails if any resource is executable, lacks a license, duplicates a
  slug, or points at a missing vendored `SKILL.md`.
- `src/lib/vendored-skills.test.ts` asserts the catalog, downloads, and registries stay consistent
  in CI.

## Registries

- `config/marketplace-sources.registry.json` adds discovery sources
  `openhands-extensions-skills`, `openhands-core-skills`, `manus-skills`, and `openclaw-skills`.
- `config/capability-sources.registry.json` records each source as `vendored_metadata_only` with
  `install_policy: metadata_only_review_required` and a `vendored_path`.

## Attribution

Each catalog row keeps `source_url` and `repository_url` pointing at the upstream repository and
sets `installation_config.vendored_path` to the in-repo copy. Upstream licenses are preserved;
Open-Connect ships the packages as metadata only and does not relicense them.

## Review boundary

Vendored packages are `published` so they are visible in the marketplace, but every row is
`verified: false` with `installation_config.review_state = vendored_review_required` and
`executable: false`. Promotion to installable remains an explicit, separate approval.
