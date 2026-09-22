# ChatGPT connection

Name: Open-Connect. MCP URL: https://open-connect.site/mcp. Authentication: OAuth. Client ID and secret: leave blank for dynamic registration. Logo: https://open-connect.site/hillstreet-logo.png (original HillStreet artwork).

Sign in to Open-Connect and approve the requested permissions. No API key is needed. The client receives a dedicated revocable token, visible as OAuth: <client name> in API keys & MCP. Tokens expire after 30 days; reconnect after expiration. Refresh tokens are not advertised or issued.

Existing connections created before this change must be recreated to register their exact callback URI. Authorization codes are opaque, hashed at rest, valid for five minutes, bound to the registered callback and client, and redeemed only once with PKCE S256. API keys remain available separately for bearer-token clients.

Open-Connect uses the open-platform Supabase project for both browser login and server session validation. Gateway token verification and public catalog discovery no longer depend on service-role credentials. Other privileged operations still require correctly configured server credentials.

Database checks passed: invalid PKCE rejection, issuance, exact scopes, gateway verification, expiration and replay rejection. Test writes were rolled back. Full ChatGPT installation, provider execution and live account-menu verification are separate acceptance checks.
