# Zeabur MCP Bridge

Authenticated Streamable HTTP bridge for Zeabur's official stdio MCP server.

Required secrets: `ZEABUR_TOKEN` and an independent `MCP_BRIDGE_TOKEN`.

- `GET /healthz` — readiness
- `/mcp` — MCP endpoint requiring `Authorization: Bearer ...`

Never reuse the Zeabur account token as the client-facing bridge token.
