# Composio Sync — Status as of 2026-10-24

## Verified working (live tool calls executed 2026-10-24)
| Custom MCP app | Composio toolkit | Account | Verified |
|---|---|---|---|
| open-connect.site hub | custom_open_connect | custom_open_connect_sycock-nomial | Yes — OPEN_CONNECT_STATUS returned 117 connections, 867 published resources |
| open-tgate.site | custom_open_tgate | custom_open_tgate_bud-sinner | Yes — LIST_ACCOUNTS returned live account data |
| mcp.gitbook.com/mcp | custom_gitbook | custom_gitbook_batch-teeny / custom_gitbook_rename-crow | Yes |
| connect.composio.dev/mcp | custom_composio_mcp | custom_composio_mcp_cloy-bedown | Yes — full meta toolset |

## Pending one dashboard entry each (custom MCP registration is dashboard-only)
| App | MCP server URL | Auth | Status |
|---|---|---|---|
| open-teleset.site | https://open-teleset.site/mcp | Bearer superuser token (NEW token issued 2026-10-24; never commit tokens to this repository) | Toolkit custom_open_teleset not yet visible; after editing the entry and retrying sync, tools appear as CUSTOM_OPEN_TELESET_* (28 expected) |
| open-system.space | https://open-system.space/mcp | Bearer API key | 29 tools expected after registration |
| open-box.space | https://open-box.space/mcp | Bearer API key | 25 tools expected after registration |
| Zeabur MCP Bridge | Service URL of deployed hillstreet-ph/zeabur-mcp-bridge | Bearer ZEABUR_TOKEN | Import hillstreet-ph/zeabur-mcp-bridge in the Zeabur dashboard, set ZEABUR_TOKEN env var, register the service URL; delete broken connection custom_zeabur_mcp_bridge_oord-anacid (HTTP 500) |

Dashboard registration URL: https://dashboard.composio.dev/~/org/connect/apps?add-custom-mcp=true

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
