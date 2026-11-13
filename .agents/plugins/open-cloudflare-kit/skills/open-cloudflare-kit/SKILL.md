---
name: open-cloudflare-kit
description: Unified full-lifecycle Cloudflare toolkit for authorized read/write operations across accounts, zones, DNS, Pages, Workers, Durable Objects, storage, AI, networking, security, observability, and deployment. Use for Cloudflare discovery, audits, configuration, deployment, repair, optimization, MCP development, Wrangler workflows, and production validation through the official Cloudflare MCP.
---

# Open Cloudflare Kit

Operate Cloudflare through the official Code Mode MCP at `https://mcp.cloudflare.com/mcp`. Treat “full access” as broad functional coverage subject to the permissions granted by the connected OAuth account, not permission to bypass approvals or provider controls.

## Capability map

- Select and configure Cloudflare products.
- Build AI agents with Agents SDK, Workers AI, AI Gateway, Vectorize, Workflows, and Durable Objects.
- Build and operate MCP servers on Workers.
- Develop and deploy Workers and Pages with Wrangler.
- Manage authorized DNS, domains, TLS, redirects, cache, WAF, Access, networking, and observability.
- Manage required bindings for KV, R2, D1, Queues, Durable Objects, Hyperdrive, AI, and service bindings.
- Use Sandbox SDK for isolated execution when appropriate.
- Audit and optimize web performance and Workers architecture.

Read [references/operations.md](references/operations.md) for the lifecycle, validation gates, and product routing. Read [references/mcp.md](references/mcp.md) when connecting or testing Cloudflare MCP clients.

## Required workflow

1. Identify the intended Cloudflare account, zone, project, environment, and origin.
2. Search the live Cloudflare API schema before calling an unfamiliar endpoint.
3. Read current state before every write and record the known-good value for rollback.
4. Preserve DNS mail, verification, OAuth, and service records unless explicitly authorized to change them.
5. Plan the smallest reversible change and classify its production/security impact.
6. Obtain required confirmation immediately before destructive, permission, credential, DNS, TLS, WAF, Access, billing, or production-cutover actions.
7. Execute only through the connected official Cloudflare MCP, Wrangler, or the authorized repository workflow.
8. Verify API success plus the affected DNS, TLS, route, deployment, application, and health behavior.
9. Record what changed, evidence, rollback, remaining blockers, and follow-up monitoring.

## Safety boundaries

- Never expose or package tokens, API keys, OAuth data, cookies, private keys, secret values, or credential files.
- Never create duplicate zones, projects, Workers, routes, records, or bindings.
- Never weaken TLS, WAF, Access, or authentication to hide an origin problem.
- Never cache authenticated or private responses at a shared edge.
- Never replace an origin or apex route without verifying dependencies and rollback.
- Prefer scoped OAuth/API permissions and server-side secret references.
- Respect provider plan limits and require authorization before paid upgrades.

## Open-Connect architecture

For `open-connect.site`:

- Keep Cloudflare Pages as the web/edge owner of the apex and `www` hostnames.
- Use `.output/public` as the Pages output directory.
- Keep Zeabur as the server/API origin on an API hostname; do not let it compete for the apex.
- Keep Supabase auth callback URLs aligned with production and preview domains.
- Verify GitHub checks, Pages deployment, DNS, TLS, API health, OAuth, and rollback after promotion.

## Completion standard

Report only evidence-backed states: `DISCOVERED`, `AUDITED`, `CONFIGURED`, `DEPLOYED`, `VERIFIED`, `PARTIALLY_VERIFIED`, `BLOCKED`, or `FAILED`. Do not claim end-to-end completion until the relevant DNS, TLS, deployment, application, security, and observability checks pass.
