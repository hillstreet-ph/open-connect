# Capability sources

The canonical machine-readable registry is `config/capability-sources.registry.json`.

| Source | Category | State | Installation boundary |
|---|---|---|---|
| Docker Agent MCP | Infrastructure | Cataloged | Runtime must have Docker Agent and provider OAuth/environment bindings |
| Docker Agent Skills | Developer | Cataloged | Reuses canonical `SKILL.md` packages; no duplicate copies |
| OPX Coding | Developer | Discovery only | Package-by-package provenance, license, and duplicate review |
| TinyFish | Browser | Authorization required | OAuth preferred; API key only through `credential://tinyfish/open-connect` |
| ToolMatch | Developer | Endpoint required | Not published until its official endpoint/package is verified |

## Deduplication

Capabilities are keyed by kind, canonical URL, and canonical name. Official sources win over verified first-party, verified community, and discovery-only sources. Tool-name collisions are resolved with a namespace or an explicit allowlist. Skill collisions retain the highest-precedence source.

## ChatGPT app registration

Open-Connect exposes its production MCP endpoint at `https://open-connect.site/mcp`. ChatGPT registration is an account-level authorization step: enable Developer Mode, create an app for that HTTPS MCP endpoint, complete OAuth, then refresh the app after tool metadata changes. Repository configuration cannot silently install an app into a ChatGPT account.

## Credential rules

- OAuth is preferred for user-scoped connections.
- Non-OAuth secrets are resolved server-side through opaque `credential://` references.
- Raw passwords, API keys, browser cookies, and provider tokens never enter Git, skill packages, prompts, or model context.
- Production mutations and permission changes remain approval-gated.
