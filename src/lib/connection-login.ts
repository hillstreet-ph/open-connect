type LoginApp = {
  provider: string;
  display_name: string;
  oauth: boolean;
  oauth_ready: boolean;
  oauth_supported?: boolean;
  connection_method?: string;
  auth_methods?: readonly string[];
};

/** A hosted credential form is not necessarily a provider OAuth sign-in. */
export function connectionLogin(app: LoginApp) {
  const schemes = (app.auth_methods ?? []).map((scheme) => scheme.toUpperCase());
  const oauth =
    app.connection_method === "native_oauth" ||
    (app.oauth &&
      (app.oauth_supported ?? schemes.some((scheme) => ["OAUTH2", "OAUTH1"].includes(scheme))));
  if (app.provider === "custom_mcp")
    return {
      label: "API/token",
      action: "Connect MCP server",
      detail:
        "Enter the server URL and its access token. The credential is stored privately; agent access stays limited to the provider's actual grant.",
    };
  if (["proton_pass", "proton_drive"].includes(app.provider))
    return {
      label: "Native login + executor token",
      action: "Connect Proton executor",
      detail:
        "Complete Proton browser login on your isolated executor, then enter its HTTPS MCP URL and separate bridge bearer token. Native Proton credentials stay on that host.",
    };
  if (oauth)
    return {
      label: app.oauth_ready ? "OAuth · recommended" : "OAuth · setup required",
      action: `Sign in with ${app.display_name}`,
      detail: app.oauth_ready
        ? "Continue to secure authorization. Select your account and approve the provider permissions, then return here. Existing accounts remain available."
        : "Provider OAuth setup is required before sign-in. A custom MCP server can use its own discovered OAuth flow; a documented API can use an API/token connector.",
    };
  if (app.connection_method === "managed_oauth" && schemes.length === 0)
    return {
      label: "Secure hosted setup",
      action: "Continue to secure connection",
      detail:
        "The provider connection form will show its supported sign-in or credential method. Existing account permissions remain enforced.",
    };
  if (app.connection_method === "managed_oauth")
    return {
      label: "API/token · secure hosted setup",
      action: "Enter API/token securely",
      detail:
        "Continue to the secure connection form to enter the credential types this provider supports. A hosted token form does not grant OAuth or administrator permissions.",
    };
  return {
    label: "API/token",
    action: "Enter API/token",
    detail:
      "Enter the provider-issued API key or access token. It is stored privately; permissions remain limited to the provider's actual grant.",
  };
}

export function defaultConnectorAuth(_protocol: string, saved?: unknown): string {
  if (typeof saved === "string" && saved) return saved === "oauth" ? "bearer" : saved;
  return "bearer";
}

export function authForProtocol(protocol: string, auth: string): string {
  return protocol === "openapi" && auth === "oauth" ? "bearer" : auth;
}

export function connectionUsesBrowserLogin(account: {
  browser_login?: boolean;
  credential_reference?: string | null;
  metadata?: unknown;
}) {
  if (typeof account.browser_login === "boolean") return account.browser_login;
  const metadata =
    account.metadata && typeof account.metadata === "object" && !Array.isArray(account.metadata)
      ? (account.metadata as Record<string, unknown>)
      : {};
  return Boolean(
    account.credential_reference?.startsWith("composio://connected-account/") ||
      ["oauth", "managed_oauth"].includes(String(metadata["mode"] ?? "")) ||
      metadata["auth_type"] === "oauth",
  );
}

export function connectionReconnectReady(
  account: Parameters<typeof connectionUsesBrowserLogin>[0] & { provider: string },
  catalogOAuthReady: boolean,
) {
  return (
    ["custom_mcp", "custom_api"].includes(account.provider) ||
    !connectionUsesBrowserLogin(account) ||
    catalogOAuthReady
  );
}
