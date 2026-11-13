# OpenAI and Codex integration

Open-Connect exposes one remote MCP endpoint at `https://open-connect.site/mcp`. Codex can load it
directly from `.codex/config.toml`, while the repository marketplace can install the bundled
`open-connect-plugin`.

## Authentication

Set `OPEN_CONNECT_API_KEY` in the Codex, ChatGPT, or deployment secret facility. Do not save the
value in this repository, a prompt, an artifact, or an `.env.example` file.

For an OpenAI Agents API consumer, set `OPENAI_API_KEY` only in the trusted server environment. The
agent receives the Open-Connect MCP endpoint and capability-scoped tools; provider credentials stay
inside Open-Connect or their native connector.

## Tool surface

The MCP endpoint publishes standard connector discovery tools and bounded action tools:

- `search` and `fetch` for resource discovery and retrieval
- `open_connect_status` for gateway readiness
- `list_resources`, `list_connections`, and `list_models` for inventory
- `inspect_connections` and `plan_goal` for read-only planning
- `execute_plan`, `install_capability`, and `configure_connection` for policy-controlled mutations

Mutation tools enforce authentication, scopes, approvals, and audit logging at the server. A client
instruction is not a substitute for those controls.

## Native app dependencies

The Codex plugin declares the installed GitHub and Supabase ChatGPT apps as optional dependencies.
They remain separately authorized and are used when their structured actions are a better fit than
the generic Open-Connect gateway. Cloudflare, Docker Hub, Zeabur, Sentry, and other systems remain
behind Open-Connect until verified native apps are installed and connected.

## Local validation

```bash
python3 /root/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py \
  .agents/plugins/open-connect-plugin

node .agents/plugins/open-connect-plugin/scripts/check-environment.mjs
npm run lint
npm test
npm run build
```

The environment checker reports only whether required variable names are present. It never prints
their values.
