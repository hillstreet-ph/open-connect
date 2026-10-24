# Composio Sync — Status as of 2026-10-24 (evening update)

## Verified working (live tool calls executed 2026-10-24)
| Custom MCP app | Composio toolkit | Account | Verified |
|---|---|---|---|
| open-connect.site hub | custom_open_connect | custom_open_connect_sycock-nomial | Yes — 117 connections, 867 published resources |
| open-tgate.site | custom_open_tgate | custom_open_tgate_bud-sinner | Yes — live account data |
| mcp.gitbook.com/mcp | custom_gitbook | custom_gitbook_batch-teeny / custom_gitbook_rename-crow | Yes |
| connect.composio.dev/mcp | custom_composio_mcp | custom_composio_mcp_cloy-bedown | Yes — full meta toolset |

## In progress
| App | Composio entry | Endpoint verified | Remaining fix |
|---|---|---|---|
| Zeabur MCP Bridge | custom_zeabur_bridge (registered, 0 tools, sync returns Bad request) | Yes — https://open-connect-mcp.zeabur.app/mcp responds and is bearer-protected; bare domain and /sse return not found | Edit the entry: MCP server URL must be exactly https://open-connect-mcp.zeabur.app/mcp (including /mcp); Bearer token must equal the bridge service auth env (MCP_PROXY_AUTH_TOKEN / MCP_BRIDGE_TOKEN). Then Retry sync. Delete the old broken connection custom_zeabur_mcp_bridge_oord-anacid (HTTP 500) |
| open-teleset.site | open-teleset custom toolkit (registered, 0 tools, sync returns Authentication failed) | Yes — https://open-teleset.site/mcp responds "Administrator authentication required" without auth | Edit the entry: replace the expired superuser token with the new token issued 2026-10-24 (never commit tokens to this repository), then Retry sync |

## Deferred by owner decision (2026-10-24)
- open-system.space (https://open-system.space/mcp, Bearer API key, 29 tools expected) — pending.
- open-box.space (https://open-box.space/mcp, Bearer API key, 25 tools expected) — pending.

Dashboard registration URL: https://dashboard.composio.dev/~/org/connect/apps?add-custom-mcp=true
Custom MCP registration in Composio is dashboard-only; no API or meta tool exists for it.

## Skills inventory
- sk_LopabQmiOR-3 Open-Connect (46 tools)
- sk_kkAXhr8dBz6T Zeabur Bridge (29)
- sk_byGCCA0_jxc4 Open-Teleset (28)
- sk_FCb2rDUAI8k0 Open-System (29)
- sk_ythuca39Pjbd Open-Box (25)
- sk_R4TRsLJkXXET Open-TGate (19)
- sk_pcxU-BxA5k6i open-connect.site hub

## Known issues
See docs/KNOWN_ISSUES.md — hub-internal open-tgate-mcp connection returns 500 (server-side defect in open-connect.site); the direct custom_open_tgate registration is unaffected.
