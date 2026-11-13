# OpenHands Cloud MCP Gateway

This directory holds the implementation plan for an isolated OpenHands Cloud MCP integration.

## Authentication
- Store the OpenHands API key in a protected server-side environment variable named `OPENHANDS_API_KEY`.
- Do not expose the key to the browser, ChatGPT skill content, logs, repository, or plugin ZIP.
- Use a separately authenticated HTTPS MCP endpoint for ChatGPT clients.
- Apply per-tool authorization, allowlisted repositories, audit logging and rate limits.

## Planned tools
- `openhands_list_conversations`: list authorized conversations.
- `openhands_start_conversation`: create a task against an authorized repository.
- `openhands_get_start_task`: inspect asynchronous startup.
- `openhands_get_conversation`: read execution state.
- `openhands_send_message`: continue an existing conversation (after API verification).
- `openhands_stop_conversation`: stop authorized execution (after API verification).

## Release gates
1. Confirm current OpenHands V1 API schemas against official docs.
2. Implement gateway and tests; use mocked credentials for CI.
3. Configure protected secret storage and authenticated client identity.
4. Deploy as a separate Zeabur service, preserving existing services.
5. Verify health, authentication failures, task creation, polling and audit logs.
6. Register the HTTPS MCP endpoint in ChatGPT and smoke-test actual tool calls.

Do not claim production readiness until the gateway, secret binding and live smoke tests pass.
