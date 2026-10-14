# ChatGPT connection

Name: Open-Connect. MCP URL: https://open-connect.site/mcp. Authentication: OAuth. Client ID and secret: leave blank for dynamic registration. Logo: https://open-connect.site/open-connect-mark.png.

Sign in to Open-Connect and approve the requested permissions. No API key is needed. The client receives a dedicated revocable token, visible as OAuth: <client name> under Integrations > API keys. Tokens expire after 30 days; reconnect after expiration. Refresh tokens are not advertised or issued.

Existing connections created before this change must be recreated to register their exact callback URI. Authorization codes are opaque, hashed at rest, valid for five minutes, bound to the registered callback and client, and redeemed only once with PKCE S256. API keys remain available separately for bearer-token clients.

Open-Connect uses the open-platform Supabase project for both browser login and server session validation. Gateway token verification and public catalog discovery no longer depend on service-role credentials. Other privileged operations still require correctly configured server credentials.

Database checks passed: invalid PKCE rejection, issuance, exact scopes, gateway verification, expiration and replay rejection. Test writes were rolled back. Full ChatGPT installation, provider execution and live account-menu verification are separate acceptance checks.

## Administrator access

Clients may explicitly request `control:write` for admin tools such as `configure_connection`.
Only an Admin or legacy Owner can approve this scope. The server checks the role at consent,
again when exchanging the authorization code, and when executing control operations.
Default consent stays read-only. Existing tokens are not upgraded by this deployment.

For an existing connection, use the signed-in **API keys & MCP** page to update the exact owned
active key's access profile, or reconnect with a client request that includes `control:write`.
The owner key update preserves its token, expiry and organization/workspace/project boundary.
Verify the resulting scopes with `open_connect_status` through the original client.
ChatGPT's **Allow all actions** setting controls host approvals; it does not grant server scopes.

Credential values are created and edited in the signed-in **Secrets** page. MCP exposes metadata
and opaque references, not raw credential writes or browser password injection. A skill update
does not install an executor or create a permanent browser session. After a server tool-schema
change, refresh the existing app using the host's supported app settings.

Rollout: deploy and verify the MCP per-tool scope checks first, then apply
`20261014121000_admin_oauth_consent.sql`. During the short interval, requests for the
newly advertised scope fail closed until the database allowlist is updated.
Rollback can restore the prior consent/exchange definitions and discovery metadata; no existing
key grants or account roles are rewritten by this migration.
