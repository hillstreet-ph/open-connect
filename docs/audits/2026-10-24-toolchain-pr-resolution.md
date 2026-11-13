# Remaining toolchain PR resolution

PRs #185 and #181 were reviewed against production main `04ac0889bf77919ddde059073a8b12d6fa5e10f5` and resolved through normal ancestry merges. Their unsupported version changes are deliberately not shipped. No published history is rewritten.

- #185 requests TypeScript 7.0.2. The latest typescript-eslint 8.72.0 still declares TypeScript `>=4.8.4 <6.1.0`; installed 8.70.0 has the same range. TypeScript 7 exposes a version module at the package root and moves compiler APIs to unstable paths. This release pins the validated TypeScript 5.9.3 compiler.
- #181 requests Node 26 declarations while the repository configures Node 22. Newer declarations can accept APIs absent from the deployed runtime. This release pins the validated @types/node 22.20.1 declarations.

Dependabot ignores TypeScript >=6.1 and Node declarations >=23 until an explicit toolchain/runtime migration validates their prerequisites. Compatible patches and supported updates remain enabled; the PR queue is not disabled. A future upgrade must revise these bounds with peer/API checks, lint, type validation, application tests, build and runtime verification.

This resolves the pending requests by rejecting incompatible version deltas, rather than claiming TypeScript 7 or Node 26 is deployed. PR ancestry is retained so both original requests can be recorded as merged with this explicit disposition.

Source repository retirement is separate. The combined migration still verifies 689 artifacts and records deletion_ready=false. Durable private owner backups, excluded license/runtime/submodule dispositions, and live integration-dependency checks remain required in #371 and #362. Zero open PRs does not satisfy those gates. No source repository is deleted or archived by this change.
