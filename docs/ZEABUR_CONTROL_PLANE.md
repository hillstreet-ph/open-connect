# Zeabur Control-Plane Integration

## Supported components

- Official skills: `zeabur/agent-skills`
- Official MCP server: `@zeabur/mcp-server`
- Official CLI: `npx zeabur`
- GraphQL API: `https://api.zeabur.com/graphql`
- Upload API: `https://api.zeabur.com/v2/upload`
- WebSocket API: `wss://api.zeabur.com/graphql`

## Open-Connect binding

Open-Connect exposes Zeabur through the authenticated `services/zeabur-mcp-bridge` service.

The repository currently registers `credential://zeabur/kobeplay` as the canonical Zeabur account reference. Until separate bridge references and automatic resolution are implemented and registered, operators must configure `ZEABUR_TOKEN` and `MCP_BRIDGE_TOKEN` directly as protected Zeabur service secrets. Record only their names and vault references; never place values in source, documentation, logs, or agent-visible storage.

The bridge must fail closed when either protected variable is absent. The raw Zeabur token must never be returned to an agent.

## Verified project mapping

| Project | Zeabur project |
|---|---|
| Open-System | `open-system` |
| Open-Connect | `open-connect` |
| Open-Box | `open-box` |
| Open-Teleset | `open-teleset` |

## Agent installation

```bash
npx skills add zeabur/agent-skills --all --copy
```

Installation copies instructions only. It does not authorize accounts, install provider connections, or copy credentials.

## Capability policy

Autonomous read operations include project/service inventory, deployments, logs, metrics, and environment-variable names.

Bounded non-production writes may include isolated staging deployments, an approved staging variable, or restarting a failed staging service after diagnostics.

**Every production mutation requires the production approval gate**, including deployments, variable changes, service restarts, domains, routes, volumes, scaling, and destructive actions.

## Readiness checks

A ready integration requires all of the following:

1. GraphQL `me` succeeds.
2. Official MCP `list-projects` succeeds.
3. The expected production projects are visible.
4. `zeabur-mcp-bridge` reports `RUNNING`.
5. At least one bridge domain is active.
6. `GET /healthz` returns success and reports upstream state.
7. An authenticated MCP initialization and safe read-only tool call succeed through the public bridge domain.
8. Requests without the independent bridge bearer token are rejected.
9. Logs and audit events contain no secret values.

A static HTTP 200 from the bridge process is insufficient because it does not prove upstream MCP availability. Do not mark the public endpoint ready until the authenticated end-to-end MCP probe passes.
