# Command Code in Cloud workspaces

Computer, Terminal and Sandbox include a guided Command Code setup. The guide is
instructions for the selected provider environment, not an embedded terminal or
an indication that software is already installed there. Existing connection
ownership, project grants and provider-tool discovery still apply.

## CLI and MCP

In a trusted provider terminal with Node.js 22 or newer, open the repository:

```sh
npm i -g command-code@latest
cmd login
cmd mcp add --transport http open-connect https://open-connect.site/mcp
cmd mcp auth open-connect
cmd mcp list
cmd
```

Complete the browser authentication flows as the intended user. No account keys
are bundled with the guide. MCP access uses the account's allowed tools and
project grants; model-provider configuration is separate. Verify a read action
before using write tools. CLI syntax was checked against Command Code 1.88.0.

## Command Code cloud

Connect GitHub in the Command Code account and install the Command Code GitHub
App on the intended repository. Cloud starts from pushed GitHub content, not
uncommitted local changes. In the repository, run `cmd --cloud`; use
`cmd cloud list`, `cmd cloud status <session-id>` and
`cmd cloud stop <session-id>` to manage sessions. Cloud requires an eligible plan
and credits. Review the resulting branch and pull request before merging.

Command Code hosts these sessions separately from Open-Connect's provider
workspaces. Cloud previews, permissions and Desktop feature parity are limited
by the upstream service. The Desktop app includes its runtime; configure the
MCP endpoint under Settings → MCP and model providers separately.

## Operational checks

- Check `cmd status` for account authentication; CLI installation alone does not
  establish account, GitHub App or cloud plan readiness.
- Use `cmd mcp list` to inspect configured servers and finish browser OAuth.
- Inspect provider-tool results to confirm the target environment and connection.
- Do not commit credentials or place tokens in pasted shell commands.
- Opening a workspace or reading this guide creates no paid cloud sessions.
