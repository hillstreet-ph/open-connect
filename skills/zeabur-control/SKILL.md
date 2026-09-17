---
name: zeabur-control
description: Manage KobePlay and HillStreet Zeabur projects through the authenticated Zeabur MCP connection.
---

# Zeabur Control

Use the configured `zeabur` MCP connection for project, service, deployment, domain, port, environment, and log operations.

1. Inspect before mutation and match resources by verified IDs.
2. Never print or write secret values into reports, source, issues, or logs.
3. Never delete projects, services, domains, deployments, or volumes without explicit authorization.
4. Record rollback state before production-domain, secret, or persistent-volume changes.
5. Prefer immutable Docker digests and verify runtime logs, ports, TLS, and health after changes.
6. Report `PRODUCTION_VERIFIED` only after functional endpoint checks pass.

Open-System mapping:

- Dashboard: `open-system.space` on port `9119`
- API: `api.open-system.space` on port `8642`
- MCP: `mcp.open-system.space/mcp`

Never store `ZEABUR_TOKEN` or `MCP_BRIDGE_TOKEN` in this skill.
