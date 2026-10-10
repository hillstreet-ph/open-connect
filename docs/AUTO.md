# Auto

Auto is a first-party instruction skill and a saved account preference. It reduces repeated assistant confirmations for already authorized work, and routes unmet capabilities through read-only matching. It cannot modify ChatGPT or Codex host approval policy.

The Command Center has an accessible Auto switch. `open_connect_status` returns `structuredContent` plus legacy JSON text; the app initializes the MCP Apps bridge, accepts legacy OpenAI globals, validates parent messages, and uses finite timeouts and a retry control. Both v1 and v2 resource URIs serve the updated widget.

`get_auto_mode` reads the current authenticated user and key context. `set_auto_mode` accepts only a boolean and requires `tools:invoke` (or the existing legacy aggregate scope). Preferences are keyed by user and project, workspace, organization, or personal context, in that priority order. RLS prevents other users from reading or updating a preference. Database failures produce unavailable state rather than claiming Auto is on.

`auto_discover` requires `resources:read`, respects Off, and ranks reviewed catalog metadata. It performs no provider execution or credential reveal. Host selection of tools remains the host's responsibility. MCP initialization supplies instructions appropriate to the current preference; after switching, clients should refresh tool context or read `get_auto_mode` before the next task.

The Marketplace package is the reviewed `skills/auto/SKILL.md` instruction file, served directly on authenticated download. Review: no upstream executable code, no credential retrieval, no privilege changes, no approval bypass; provider access must be independently verified. Implicit invocation is enabled in the skill descriptor but selection depends on host support. An enabled preference is not proof that an already-open chat has refreshed its tool catalog.

Apply `20261010000000_auto_mode.sql` before deploying the application. Add the Auto resource to a user's personal library only on that user's request. Never bulk-install it for unrelated accounts. Verify preference persistence, disabled discovery, account isolation, widget bridge recovery, lint, typecheck, tests, build, and SSR smoke.

## Browser credential matching

`match_browser_credentials` requires `secrets:read` in a personal key context. It reads password metadata for the authenticated owner only, matches the exact HTTPS origin (including port), and optionally matches an exact username or case-insensitive email. Parent/sibling domains and name similarity never authorize a match. Multiple matches remain ambiguous; no first-record fallback is used. The result includes credential IDs and password/TOTP availability, but no Vault IDs, passwords, seeds, or generated codes. Database or record-limit failures prevent a match.

This is a metadata resolver, not an injection executor. The current ChatGPT cloud-browser `browserAuth` contract offers secure user entry and no external credential-reference parameter. An Open-Connect password/TOTP cannot be injected into that browser through this tool. Do not fetch raw secrets into model-visible output or use lower-level browser filling as a substitute. An independently supported browser executor must document its secure broker and destination checks before automated Vault injection can be enabled. Report authenticated access only after the destination site shows a signed-in state.
