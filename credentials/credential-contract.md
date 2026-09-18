# Credential contract

Open-Connect accepts credentials only from an authorized provider secret store or an already-injected process environment. Agents request a named profile or an opaque `credential://provider/item` reference; they never receive a raw vault export.

| Logical reference                   | Runtime names                                   | Consumer                       | Minimum scope                  | Storage                          |
| ----------------------------------- | ----------------------------------------------- | ------------------------------ | ------------------------------ | -------------------------------- |
| `credential://openai/project-agent` | `OPENAI_API_KEY`; optional `OPENAI_PROJECT_ID`  | Campaign Studio, Agents runner | Requested project model access | Zeabur/GitHub environment secret |
| `credential://github/release`       | `GH_TOKEN` or `GITHUB_TOKEN`                    | Git push and Actions           | Contents, workflows, PRs       | GitHub App or runtime secret     |
| `credential://open-connect/mcp`     | `OPEN_CONNECT_API_KEY`                          | Codex/ChatGPT plugin           | Scoped Open-Connect MCP access | Client environment secret        |
| `credential://dockerhub/release`    | `DOCKERHUB_TOKEN`, `DOCKERHUB_USERNAME`         | Release workflow               | Repository push/pull           | GitHub production environment    |
| `credential://cloudflare/deploy`    | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | Edge deployment                | Target project/zone only       | GitHub production environment    |
| `credential://zeabur/deploy`        | `ZEABUR_TOKEN`                                  | Runtime deployment             | Target project/service only    | GitHub production environment    |
| `credential://sentry/release`       | `SENTRY_AUTH_TOKEN`                             | Release and source maps        | Project release write          | GitHub production environment    |

The broker first checks the process environment. Missing values are resolved through the single
host-level adapter described in `resolver-adapter.md`, using the logical references above. It selects
the smallest profile, creates a child environment containing only the selected credential names,
and reports metadata—not values. It never creates, rotates, revokes, or prints credentials.
