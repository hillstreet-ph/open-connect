# AI Factory

The private [Workforce Directory and Registry](PRIVATE_WORKFORCE.md) adds versioned specialist profiles and request-bound chats. The existing proposal-team workflow described below remains separate and unchanged.

AI Factory is available under Connections after Connectors, Credentials and AI Gateway. It manages private multi-role AI teams without creating another credentials store or installing agents automatically.

Starter categories are Development, Business, Marketing, Research, Operations and Custom. A starter fills the form; saving creates the owned team. Choose 2–6 distinct plain-text role names, a team name and a description. Team names are unique per owner, including archived teams, ignoring case and surrounding spaces. Edit a saved team, or archive and later restore it. A concurrent edit requires reloading the current version.

Select a saved active team, enter a goal and relevant context, and choose Generate team proposals. AI Gateway must have an available catalog-verified free model route. Each role makes a bounded text-generation request, with at most three fallback routes per role. Free-provider quotas and availability still apply. Classification-only safety labels are not accepted as completed proposals. Router fallback retains an explicit generative model on the same owned account, excludes specialist classifier/embedding routes and stays within three route attempts per role. The existing MCP Planner/Builder/Reviewer runner retains its default three roles. An optional `category` selects one of the same six template role sets. Templates have one source in `config/ai-factory.registry.json`.

This is a proposal-generation workflow. It does not execute code, use tools, browse sources, contact people, approve changes or deploy work. Generated research and business claims require verification. Agent resources and approved execution flows remain in Resources, Studio and the existing agent interfaces. Category and description organize the saved team; the supplied goal, context and role names form the model request.

Common credential patterns are redacted before model requests and when saving worker output. Only enter relevant context. Private history retains the goal, the role/configuration snapshot, model/provider names, generated proposals and availability status. The UI shows the latest 20 runs for the selected team. A successful run means every role returned a proposal, not that an external task was completed. Partial worker availability is shown as Needs attention; each role has its own status. An interrupted run can remain unverified and should be checked before retrying.

Database migration `20261026031704_private_ai_agency_teams.sql` creates owner-isolated team records with RLS. Anonymous table access is revoked; authenticated users can read, create and update only their own teams. Archive is reversible; no permanent-delete control is exposed. Run history uses the existing owner-protected autonomous_runs table, with an ai_agency executor marker. Server-only service access writes run evidence after checking the selected team's owner and active state.

Validation includes category coverage, role limits/duplicates, proposal-only behavior, credential redaction, partial worker failures, owner-bound/versioned REST requests and stale/duplicate save errors. A production rollback transaction verified unique names, archive/restore, owner visibility and rejection of a foreign edit without retaining fixtures. Live provider runs and signed-in interactive UI checks require an authenticated session and available free-model connection; they are distinct from mocked runner and persistence tests.

## Canonical name and compatibility

AI Factory uses `/ai-factory` throughout navigation, team management and workforce chats. Existing `/ai-agency` bookmarks redirect to `/ai-factory` with validated agent, chat, project and team-view selections preserved. The legacy route contains no separate workspace implementation. Source modules and registries use `ai-factory` filenames.

The persisted `ai_agency_teams` table, `ai_agency` run executor marker, and applied migration filenames remain stable storage contracts. They retain existing teams, ownership policies, running proposals and history across deployments; they are not product names or navigation destinations.

## Roster static pages: why `src/server.ts` is load-bearing

The roster under `/ai-factory/roster/` is a set of static HTML pages unpacked from
`scripts/ai-factory-roster.zip` at build time. They are **not** SPA routes, and the
Cloudflare asset layer alone cannot serve them.

Cloudflare canonicalizes navigation requests for `.html` files:

- `/ai-factory/roster/teams.html` → `308` → `/ai-factory/roster/teams`
- `/ai-factory/roster/teams/index.html` → `308` → `/ai-factory/roster/teams/`
- `/ai-factory/roster/teams/` → `307` → `/ai-factory/roster/teams` (trailing slash stripped)
- `/ai-factory/roster/teams` → no file → `404`

That is a closed loop: every directory-index form redirects to an extensionless URL
that has no file behind it. Emitting `<page>/index.html` alone therefore does **not**
fix the 404s — it only moves the failure one hop later.

`handleRosterAsset` in `src/server.ts` breaks the loop. It intercepts roster paths
before the SPA, resolves the page through `rosterPageCandidates()`, and fetches the
file from the `ASSETS` binding with `accept: */*` — a **subresource** request, which
the asset layer does not canonicalize. The bytes come back `200` and are returned
directly.

Consequences for future changes:

- Do **not** remove `handleRosterAsset` as a "dead passthrough". It is the only thing
  serving these pages; removing it restores the 404s. (PR #858 assumed it was inert
  because the deploy is static-assets based. That assumption was wrong — the worker
  runs, and this handler is what makes the roster reachable.)
- `public/_redirects` carries `200`-rewrites for the clean URLs as a second line of
  defence, so the pages also resolve if the worker is ever bypassed.
- Every page gets `<base href="/ai-factory/roster/">` injected, so relative
  `assets/`, `data/` and `images/` references resolve from the roster root regardless
  of which URL form the visitor arrived on.
- Cross-page links are rewritten to clean URLs (`teams.html` → `teams`), so the
  navigation never re-enters the redirect loop.

Verified in production against `https://open-connect.site/ai-factory/roster/`: all
nine pages return `200` with their own HTML, and `assets/`, `data/` and `images/`
return `200` from the base path.
