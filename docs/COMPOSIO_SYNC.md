# Composio Sync — open-connect.site connectors

State as of 2026-10-24 (final). Primary account: kairocasino8@gmail.com. GitHub organization: hillstreet-ph.

## Canonical repository
- hillstreet-ph/open-connect is the original and canonical open-connect.site application.
- The duplicate repository hillstreet-ph/open-connect-site was deleted on 2026-10-24 (verified via GitHub API 404).

## Custom MCP registrations in Composio
- custom_open_connect — ACTIVE, verified with a live tool call.
- custom_open_tgate — ACTIVE, verified with a live tool call (live Telegram account data).
- custom_gitbook — ACTIVE (https://mcp.gitbook.com/mcp, Bearer gb_api key), verified with a live operation-search call.
- custom_composio_mcp — ACTIVE (https://connect.composio.dev/mcp), exposes the full Composio meta toolset.

Pending:
- open-teleset.site — registered but tool sync rejected; retry sync or re-add with a fresh superuser token.
- open-system.space — https://open-system.space/mcp — Bearer API key.
- open-box.space — https://open-box.space/mcp — Bearer API key.
- zeabur-mcp-bridge — deploy hillstreet-ph/zeabur-mcp-bridge (see below), then register the service URL.

## Zeabur MCP Bridge (resolved)
The official @zeabur/mcp-server is a local stdio process (npx with ZEABUR_TOKEN) with no remote HTTP URL; direct Composio registration was structurally impossible. hillstreet-ph/zeabur-mcp-bridge resolves this by wrapping the server with an MCP stdio-to-HTTP proxy (mcp-proxy):
1. Import the repository as a Zeabur service (zbpack.json, type node, port 8080).
2. Set ZEABUR_TOKEN as the service environment variable (Zeabur dashboard, Settings, API tokens). Never commit the token to a public repository.
3. Protect the endpoint (Zeabur private networking or an authenticated open-tgate.site gateway route).
4. Register the service URL in Composio, then remove the broken connection custom_zeabur_mcp_bridge_oord-anacid.

## Known issues
- The hub's internal connection to the open-tgate-mcp resource returns HTTP 500 on tool listing; server-side defect in open-connect.site. The direct Composio registration of open-tgate is unaffected.

## Deployments
- GitHub Pages (live): open-system-space, open-box-space, open-teleset-site, open-tgate-site.
- Zeabur: all satellite repos carry zbpack.json {"type":"static"}; import via the Zeabur dashboard.
- Every satellite repo has a Build & validate CI workflow, an MCP tool manifest at the root, and docs/DEPLOYMENT.md.

## Skills
- 24 Vibe skills, 9 project skills, and 6 MCP toolkit skills published in Composio (tool counts: open-connect 46, zeabur 29, open-teleset 28, open-system 29, open-box 25, open-tgate 19).
