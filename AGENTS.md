<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

## Repository notes

- Toolchain: Bun (lockfile `bun.lock`) + TanStack Start + Supabase. Run `bun install`, then
  `bun run lint`, `bun run test`, `bun run build`, `bun run test:ssr`.
- The `test` script chains Node test suites (`node --experimental-strip-types --test`) and one Bun
  suite; add new suites to the matching `test:*` script in `package.json`.
- Registries live in `config/*.registry.json`; generated catalogs end in `.generated.json` and are
  rebuilt by their scripts, not hand-edited.
- `skills/vendor/**` is vendored third-party content. Never edit it by hand, and never vendor
  executable upstream code: the marketplace serves `SKILL.md` only. See
  `docs/VENDORED_SKILLS.md`.
- Marketplace rows stay metadata-only. Anything installable must be `verified: true` and pass a
  separate security review; discovery never publishes to Supabase directly.
- A migration that has reached production is frozen: never edit it in place, because environments
  record it as applied and will not run it again. Ship follow-ups in a new migration with a later
  timestamp.

## Canonical resource consolidation

- Always maintain `https://github.com/hillstreet-ph/open-connect` as the canonical product and reusable-resource repository. `v1-open-connect` and `open-custom-skills` are migration sources, not new runtime or publishing targets.
- Source pins and public-copy authorization live in `config/resource-migration.sources.json`; the generated file-by-file decisions, hashes and remaining deletion blockers live in `config/resource-migration.lock.json`.
- Never hand-edit `resources/migrated/**` or generated download/lock registries. Regenerate with `scripts/consolidate_resources.py` from reviewed pinned sources, then run its offline integrity check.
- Do not execute legacy SQL, copy restricted-license/executable support, silently overwrite existing resource IDs or review status, or mark a source repository safe to delete merely because names/slugs match.
- Content-addressed package archives are append-only. Retain old versions so prior deployments and rollbacks keep their matching download bytes and checksums.
- `master-kanor/manus-skills` and `master-kanor/manuskills` are also pinned migration sources. Snapshot ZIPs are comparison evidence only; never publish whole application snapshots, environment files, executable support or restricted-license packages.
- Keep new candidates unverified and unpublished until their actual content, license and runtime dependencies have been reviewed. Do not delete or archive the source repositories without explicit authorization and a completed retirement checklist.
