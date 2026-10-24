# Open PR validation — 2026-10-24

Canonical release work: issue #371. Base: `d199257fcb24731d38ee9e10b423b0462201279a`.

## Integrated PR branches

The release integrates original branch ancestry with normal merge commits; no published history is rewritten. Final approval depends on combined CI and independent review, not old branch checks alone.

| PR | Result in release |
| --- | --- |
| #351 | certifi lock update. Current Python Docker/CI use pip, so this does not establish the deployed certificate version. |
| #347 | checkout v7 in drift workflow. |
| #178 | setup-python v7. |
| #177 | setup-node v7. |
| #323 | MCP SDK 1.32.1; existing same-origin/redirect rejection retained. |
| #328 | Avatar 1.2.7. |
| #324 | Hover card 1.1.24. |
| #327 | Navigation menu 1.3.0. |
| #326 | Radio group 1.4.8. |
| #325 | Prettier 3.9.10. |
| #182 | Lovable TanStack config 2.25.1; current app changes retained, lock regenerated. |
| #188 | Repaired peer mismatch by pairing ESLint 10.0.1 and @eslint/js 10.0.1. Compatible existing plugins retained. Credential-bearing remote errors stay sanitized. |
| #370 | Connector sync documentation. Provider dashboard deferrals remain explicit, not declared resolved by merging docs. |
| #364 | Client-neutral OAuth error only; 14 scopes, PKCE and administrator checks unchanged. Production migration must be verified separately. |
| #346 | Completed review enforcement beyond draft badges: explicit shared approval, direct package and Storage gates, MCP and library labels, state-preserving review writes with version conflict detection. |
| #176 | Metadata-only candidate refresh; 228 candidates pass strict catalog validation and remain non-installable pending review. |

Updated application packages are pinned to the reviewed target versions; existing unrelated dependencies are not blanket-upgraded.

## Held PRs

- #185: TypeScript 7.0.2 is incompatible with locked typescript-eslint 8.70.0's supported compiler range (`>=4.8.4 <6.1.0`) and traditional compiler API. Keep TypeScript 5.9.3 until supported tooling is selected and tested.
- #181: Node 26 type declarations do not describe the configured Node 22 runtime. Keep the Node 22 type line until an explicit runtime alignment migration is validated.

These PRs are intentionally left open with concrete blockers, not merged merely to clear the queue. All 18 PRs had no unresolved inline review threads at inventory time.

## Marketplace behavior

Missing/malformed public review state now defaults to pending. Published+verified alone does not authorize shared package access or execution. Owners can still download their own uploads. The 13 reviewed canonical legacy artifacts retain compatibility only through the exact migration registry/source/hash, and never override an explicit pending/quarantined state. Stored packages require explicit approval; there is no arbitrary legacy Storage exception.

Reviewer Verify actions explicitly approve while preserving other configuration. Publish alone never approves. Single and bulk writes compare updated_at before updating; stale reviews are rejected/reported rather than silently retried. Bulk requests use bounded groups of ten writes. Storage SELECT permits owner paths or published, verified resources with explicit approved configuration. No candidate is auto-approved or published by this release.

## Remaining issues and validation boundaries

Existing operational/feature issues remain open unless their acceptance criteria are actually verified. Connector dashboard tokens, external callbacks/provider execution, isolated monitoring, shared-platform security findings, deployment-ledger work and source-retirement gates cannot be declared complete from application unit tests. Supabase advisor findings include shared schemas outside this release and remain tracked under #80; no blanket role grants or global RLS changes are made.

Run importer integrity/tests, full application tests, strict TypeScript, ESLint, production build, SSR routes and catalog validation on the final combined tree. Independent reviews and exact-commit production health/OAuth/public-page checks are required before reporting deployment success.

## Dependency advisory remediation

A pre-merge Bun audit identified 27 advisories (3 critical, 10 high, 11 moderate, 3 low). The release patches React Start to 1.168.60 and its matching React Router to 1.170.41 (server core 1.169.39), Vite to 8.3.5 and Zod to 4.6.7. Narrow exact overrides retain compatible major lines for body-parser 2.4.0, brace-expansion 5.0.12, fast-uri 3.1.9, Hono 4.13.13, ip-address 10.7.4, js-yaml 4.3.2, launch-editor 2.14.2, shell-quote 1.12.0 and source-map-js 1.2.2.

`bun audit --json` returns `{}` after installation. CI audits dependencies to prevent silent regression. These results concern this Bun dependency graph; they do not assert that GitHub advisory records for other manifests, Python/container images or excluded legacy sources are all resolved. Overrides can be removed when the parents' regenerated locks resolve patched compatible versions without them.
