# ChatGPT, Claude and organization API connections

## Connect Open-Connect inside an AI app

Use `https://open-connect.site/mcp` in the app's supported remote MCP connection settings. Use OAuth, sign in to Open-Connect and select the requested access profile. Only an actual Open-Connect Admin/Owner can approve its administrator profile. Upstream providers retain their own roles, account grants and approval rules. OAuth approval does not sign in to Proton or administer ChatGPT/Claude workspaces.

The server supports authorization-code PKCE S256, exact registered HTTPS callbacks and dynamic client registration with public-client `none` token authentication. It does not advertise CIMD, private-key JWT, refresh-token grants or OIDC email/domain restrictions. New OAuth tokens are bound to the exact resource `https://open-connect.site/mcp`; manual API keys and older grants retain their existing behavior. Reconnect older OAuth links to obtain the new resource binding. Success and cancellation callbacks include `iss=https://open-connect.site`. Registered callbacks are checked before any redirect.

`get_profile` returns the validated Open-Connect user's immutable opaque ID in `structuredContent` and JSON text. It takes no account selector, reads no password values and is marked with `openai/profile`. Tool scope denials return a valid MCP error result with `mcp/www_authenticate` metadata over HTTP 200 so the client can initiate linking. Invalid credentials remain HTTP 401 and role/provider access denials remain enforced. Actual host linking UI and stable callback selection must still be verified in that host's connection settings; server tests cannot prove app-side linking.

## Connect supported provider APIs to Open-Connect

First reuse an existing account connection. Connections → custom connector offers reviewed organization API templates:

| Template                              | Credential                                            | Supported operations                        |
| ------------------------------------- | ----------------------------------------------------- | ------------------------------------------- |
| OpenAI organization administration    | Organization **Admin API key**, Bearer authentication | List and create API organization projects   |
| Anthropic organization administration | Provider-authorized **Admin API key**, `x-api-key`    | List and create API organization workspaces |

Setup validates the OpenAPI definition; it does **not** prove provider authentication or execute an API operation. Verify with the list operation on the selected account before enabling writes. The existing OpenAPI executor validates tool arguments, account ownership and write confirmation. It does not grant missing provider permissions. Do not paste an ordinary model key and assume it has organization administration rights.

These APIs are separate from consumer ChatGPT/Claude accounts, app installations, subscriptions and chat histories. Do not use browser cookies or invent OAuth endpoints to obtain those capabilities. For another documented API, import its reviewed OpenAPI schema through the same connector. For an actual MCP provider with discovery metadata, use the existing OAuth connector flow and its exact documented scopes. No speculative provider OAuth endpoint is configured by these templates.

References: [OpenAI MCP authentication](https://developers.openai.com/plugins/build/auth), [OpenAI administration](https://developers.openai.com/api/reference/administration/overview), [Anthropic Admin API](https://platform.claude.com/docs/en/manage-claude/admin-api). Proton uses the separate [native executor setup](../services/proton-mcp/README.md).
