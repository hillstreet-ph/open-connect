# Known Issues — open-connect.site

## 1. Hub internal MCP connection to open-tgate-mcp returns HTTP 500

Severity: High (blocks hub-mediated tool listing; direct Composio registration of open-tgate.site is unaffected).

### Reproduction (verified twice, 2026-10-24)
1. Composio toolkit custom_open_connect (account custom_open_connect_sysock-nomial), tool list_connection_tools, connection_id "open-tgate-mcp".
2. Observed error (both attempts):
   - "MCP tool list_connection_tools failed: StreamableHTTP (HTTP 500 Internal Server Error), simple HTTP (WouldBlock: )"

### Analysis
- The hub attempted both transports: Streamable HTTP (server answered 500) and simple HTTP (WouldBlock, an empty/blocked stream read). This indicates the hub's server-side proxy to the registered open-tgate-mcp resource fails while listing tools, before any tool result is produced.
- The same connection listing works when Composio calls open-tgate.site/mcp directly (verified with a live CUSTOM_OPEN_TGATE_LIST_ACCOUNTS call returning account data), so the defect is in the hub's connection/proxy layer, not in the open-tgate.site MCP server.
- Suggested investigation points, in order:
  1. Connection record for "open-tgate-mcp": verify the stored endpoint URL and that the stored Authorization header is propagated on the tools/list request.
  2. Transport negotiation: "WouldBlock" on the simple HTTP path suggests an SSE/streamed response that the reader treated as empty; confirm the proxy consumes Streamable HTTP responses correctly and does not fall back prematurely.
  3. Timeout behavior: return a typed error (504/timeout) instead of a raw 500 so clients can retry with backoff.
  4. Add server-side logging for connection_id, transport, and the upstream status code on list_connection_tools failures.

### Impact
- Hub-mediated discovery and invocation of the open-tgate connection's tools (CUSTOM_OPEN_CONNECT_LIST_CONNECTION_TOOLS and CALL_CONNECTION_TOOL scoped to "open-tgate-mcp").
- Unaffected: direct Composio registration custom_open_tgate; hub search, resource catalog, and knowledge tools.

## 2. Pending Composio registrations (not defects)
- open-teleset.site: registered in Composio but tool sync rejected; retry sync or re-add with a fresh superuser token.
- open-system.space and open-box.space: not yet registered; endpoints live and documented.
- Zeabur MCP Bridge: root cause resolved by design — see hillstreet-ph/zeabur-mcp-bridge (local stdio server wrapped with an HTTP proxy); deploy the service, set ZEABUR_TOKEN, then register the service URL.
