# Composio Sync — open-connect.site connectors

Final state as of 2026-10-24. Primary account: kairocasino8@gmail.com. GitHub organization: hillstreet-ph.

## Canonical repository
- hillstreet-ph/open-connect is the original and canonical open-connect.site application.
- The duplicate repository hillstreet-ph/open-connect-site was deleted on 2026-10-24 (verified via GitHub API 404).

## Custom MCP registrations in Composio
- custom_open_connect — ACTIVE, verified with a live tool call.
- custom_open_tgate — ACTIVE, verified with a live tool call (live Telegram account data returned).

Pending registration (dashboard entry required at https://dashboard.composio.dev/~/org/connect/apps?add-custom-mcp=true):
- open-teleset.site — https://open-teleset.site/mcp — Bearer superuser token — 28 tools.
- open-system.space — https://open-system.space/mcp — Bearer API key — 29 tools.
- open-box.space — https://open-box.space/mcp — Bearer API key — 25 tools.
- Zeabur MCP Bridge — Zeabur MCP endpoint — Bearer Zeabur API token — 29 tools.

## Known issues
- The hub's internal connection to the open-tgate-mcp resource returns HTTP 500 on tool listing; server-side defect in open-connect.site. The direct Composio registration of open-tgate is unaffected.
- The Zeabur MCP bridge connection returns HTTP 500; GitHub-based deployment is the fallback.

## Deployments
- GitHub Pages (live): open-system-space, open-box-space, open-teleset-site, open-tgate-site.
- Zeabur: all satellite repos carry zbpack.json {"type":"static"}; import via the Zeabur dashboard.
- Every satellite repo has a Build & validate CI workflow, an MCP tool manifest at the root, and docs/DEPLOYMENT.md.

## Skills
- 24 Vibe skills, 9 project skills, and 6 MCP toolkit skills published in Composio (tool counts: open-connect 46, zeabur 29, open-teleset 28, open-system 29, open-box 25, open-tgate 19).
