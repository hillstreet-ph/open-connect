# Open Connect on other agent clients

Use the existing hosted HTTP MCP endpoint: `https://open-connect.site/mcp`.

1. In the client's supported remote MCP settings, add that endpoint only if there is no existing Open Connect connection.
2. Complete the provider's OAuth account selection and consent. Never copy another host's tokens into this configuration.
3. Load the `auto` and `open-connect-control` Agent Skills using the client's documented skill loader. The portable skill archive contains instructions only, not executors or provider credentials.
4. Discover the tool schema, call the advertised status tool, list permitted workspaces/projects and select the intended project.
5. Run a bounded read, then a concrete authorized write and read-back before marking that operation ready. Missing tools must be reported explicitly.

ChatGPT's App-backed plugin release does not install itself into Hermes, Claude, Codex or another client. Remote MCP, OAuth, skill loading and device execution support vary by client version. Local stdio-only clients need their supported transport adapter or runtime; no such adapter is bundled here.

Use the three copyable starter prompts in `skills/open-connect-control/SKILL.md`. Native App prompt buttons, model selection and organization administration remain owned by the relevant host settings.
