export const OAUTH_ISSUER = "https://open-connect.site";
export const MCP_RESOURCE = `${OAUTH_ISSUER}/mcp`;

/** One resource is supported; never silently accept a different audience. */
export function oauthResource(value: unknown): string {
  if (value === undefined || value === "") return MCP_RESOURCE;
  if (value !== MCP_RESOURCE) throw new Error("Unsupported OAuth resource.");
  return MCP_RESOURCE;
}

export function resourceAllowsRequest(resource: unknown, requestUrl: string): boolean {
  if (resource === undefined || resource === null) return true; // Existing/manual API keys.
  if (resource !== MCP_RESOURCE) return false;
  const url = new URL(requestUrl);
  return url.origin === OAUTH_ISSUER && url.pathname === "/mcp";
}

/** Call only after the client and exact callback were verified server-side. */
export function oauthCallback(
  redirectUri: string,
  state: string,
  result: { code: string } | { error: "access_denied" },
): string {
  const url = new URL(redirectUri);
  if (url.protocol !== "https:" || url.username || url.password || url.hash)
    throw new Error("Invalid OAuth callback.");
  url.searchParams.delete("code");
  url.searchParams.delete("error");
  url.searchParams.delete("state");
  for (const [key, value] of Object.entries(result)) url.searchParams.set(key, value);
  if (state) url.searchParams.set("state", state);
  url.searchParams.set("iss", OAUTH_ISSUER);
  return url.href;
}

export const PROFILE_SCHEMA = {
  type: "object",
  properties: { id: { type: "string", minLength: 1, pattern: "\\S" } },
  required: ["id"],
  additionalProperties: false,
} as const;

export function authenticatedProfile(userId: unknown) {
  if (typeof userId !== "string" || !userId.trim())
    throw new Error("Profile identity unavailable.");
  return { id: userId };
}

export function oauthScopeChallenge(scope: string) {
  // Scope names are selected from the server allowlist, never caller input.
  return `Bearer resource_metadata="${OAUTH_ISSUER}/.well-known/oauth-protected-resource", error="insufficient_scope", error_description="Reconnect to grant the required permissions", scope="${scope}"`;
}
