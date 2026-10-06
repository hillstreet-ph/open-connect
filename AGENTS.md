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
