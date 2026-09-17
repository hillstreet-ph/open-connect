# Zeabur Control-Plane Integration

## Supported components

- Official skills: `zeabur/agent-skills`
- Official MCP server: `@zeabur/mcp-server`
- Official CLI: `npx zeabur`
- GraphQL API: `https://api.zeabur.com/graphql`
- Upload API: `https://api.zeabur.com/v2/upload`
- WebSocket API: `wss://api.zeabur.com/graphql`

References:

- https://github.com/zeabur/agent-skills
- https://zeabur.com/docs/en-US/developer/cli
- https://zeabur.com/docs/en-US/server/operate

## Open-Connect binding

Open-Connect exposes Zeabur through the authenticated `services/zeabur-mcp-bridge` service.

Required server-side references:

| Environment variable | Source |
|---|---|
| `ZEABUR_TOKEN` | `credential://zeabur/production-api` |
| `MCP_BRIDGE_TOKEN` | `credential://open-connect/zeabur-mcp-bridge` |

The raw Zeabur account token must never be returned to an agent. Open-Connect resolves the reference and injects the value into the bridge service.

## Verified production mapping

| Project | Zeabur project |
|---|---|
| Open-System | `open-system` |
| Open-Connect | `open-connect` |
| Open-Box | `open-box` |
| Open-Teleset | `open-teleset` |

The account also contains the Wonder Mesh gateway project required by the dedicated-server environment.

## Agent installation

Install every official Zeabur skill for supported agents:

```bash
npx skills add zeabur/agent-skills --all --copy
```

Install only Claude Code and Codex targets:

```bash
npx skills add zeabur/agent-skills \
  --agent claude-code codex \
  --skill '*' \
  --copy \
  --yes
```

## Capability policy

Autonomous read operations include project/service inventory, deployments, build/runtime logs, metrics, and environment-variable names.

Bounded write operations include staging deployments, updating an approved variable, and restarting a failed service after diagnostics.

Project deletion, service deletion, domain cutover, volume changes, dedicated-server reboot, and production data operations require the production approval gate.

## Readiness checks

A ready integration requires all of the following:

1. GraphQL `me` succeeds.
2. MCP `list-projects` succeeds.
3. The four production projects are visible.
4. `zeabur-mcp-bridge` reports `RUNNING`.
5. At least one bridge domain is active and `GET /healthz` returns HTTP 200.
6. MCP requests require the independent bridge bearer token.
7. Logs and audit events contain no secret values.

Current limitation: the bridge service is running, but its custom and generated domains are still provisioning. Do not mark the public MCP endpoint ready until its health check succeeds.
