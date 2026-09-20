# Open-Connect ChatGPT Action

Open-Connect exposes two complementary ChatGPT integrations:

- Preferred plugin/MCP endpoint: `https://open-connect.site/mcp`
- GPT Action schema: `https://open-connect.site/openapi.json`

## Action setup

1. In the GPT editor, add an Action and import `https://open-connect.site/openapi.json`.
2. Choose OAuth for user-scoped access when the editor supports the Open-Connect authorization
   flow. Authorization URL: `https://open-connect.site/oauth/authorize`; token URL:
   `https://open-connect.site/oauth/token`.
3. For a private owner-only GPT, bearer authentication can use a scoped `oc_live_...` key created
   in Open-Connect. Store it only in ChatGPT's encrypted Action authentication settings.
4. Test `readOpenConnect` with `open_connect_status`, then `list_connections`, then `search`.
5. Keep `writeOpenConnect` confirmation enabled. Open-Connect applies owner/admin, OAuth scope,
   approval, and production gates again on the server.

The repository cannot install an Action into a ChatGPT account automatically. Account-level app
registration, OAuth consent, and the ChatGPT-generated redirect URI must be completed in ChatGPT.

## Safety contract

- Read and consequential operations use separate endpoints.
- Undocumented action names are rejected before execution.
- Raw credentials are never accepted; connection writes require opaque `credential://` references.
- All operations execute through the existing MCP gateway, preserving audit logging and scope checks.
