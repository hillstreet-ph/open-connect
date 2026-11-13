/**
 * Bring-your-own OAuth app support for outbound connections.
 *
 * The user registers an OAuth app with the provider (for example Airtable's
 * "Register an integration" or Railway's workspace Developer page), sets the
 * redirect URL below, then gives Open-Connect the client ID and secret. Open-
 * Connect runs the authorization-code flow with PKCE and keeps the tokens in the
 * credential vault. Providers that publish RFC 8414 metadata use `issuer`;
 * others use explicit authorization and token endpoints.
 */
export const OUTBOUND_OAUTH_REDIRECT_URL = "https://open-connect.site/custom-oauth-callback";

export type TokenAuthMethod = "client_secret_basic" | "client_secret_post";

export type OAuthAppPreset = {
  id: string;
  name: string;
  /** Where the user registers the OAuth app and copies its client ID and secret. */
  registerUrl: string;
  docsUrl: string;
  issuer?: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  tokenAuthMethod: TokenAuthMethod;
  scopes: string;
  hint: string;
};

export const OAUTH_APP_PRESETS: readonly OAuthAppPreset[] = [
  {
    id: "airtable",
    name: "Airtable",
    registerUrl: "https://airtable.com/create/oauth",
    docsUrl: "https://airtable.com/developers/web/guides/oauth-integrations",
    authorizationEndpoint: "https://airtable.com/oauth2/v1/authorize",
    tokenEndpoint: "https://airtable.com/oauth2/v1/token",
    tokenAuthMethod: "client_secret_basic",
    scopes: "data.records:read data.records:write schema.bases:read",
    hint: "Register an integration, add the redirect URL, choose the same scopes, then generate a client secret.",
  },
  {
    id: "railway",
    name: "Railway",
    registerUrl: "https://railway.com/workspace/developer",
    docsUrl: "https://docs.railway.com/integrations/oauth",
    issuer: "https://backboard.railway.com",
    tokenAuthMethod: "client_secret_basic",
    scopes: "openid profile email offline_access",
    hint: "Create an OAuth app in your workspace Developer settings and add the redirect URL. offline_access keeps the connection refreshable.",
  },
];

export type ManualOAuthEndpoints = {
  authorization_endpoint: string;
  token_endpoint: string;
  token_auth_method?: TokenAuthMethod;
  scope?: string;
};

function httpsUrl(value: string, label: string): URL {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash)
    throw new Error(`${label} must be an HTTPS URL without credentials or a fragment`);
  return url;
}

/**
 * Authorization-server metadata for a provider that does not publish RFC 8414
 * discovery. The MCP SDK uses this cached metadata instead of discovering it.
 */
export function manualAuthorizationServerMetadata(input: ManualOAuthEndpoints) {
  const authorize = httpsUrl(input.authorization_endpoint, "Authorization URL");
  const token = httpsUrl(input.token_endpoint, "Token URL");
  if (
    authorize.origin !== token.origin &&
    authorize.hostname.split(".").slice(-2).join(".") !==
      token.hostname.split(".").slice(-2).join(".")
  )
    throw new Error("Authorization and token URLs must belong to the same provider domain");
  const method = input.token_auth_method ?? "client_secret_basic";
  if (method !== "client_secret_basic" && method !== "client_secret_post")
    throw new Error("Unsupported token authentication method");
  const scopes = (input.scope ?? "").split(/\s+/).filter(Boolean);
  return {
    issuer: authorize.origin,
    authorization_endpoint: authorize.toString(),
    token_endpoint: token.toString(),
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: [method],
    ...(scopes.length ? { scopes_supported: scopes } : {}),
  };
}
