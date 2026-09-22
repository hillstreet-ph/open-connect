export const OAUTH_SCOPES = [
  "openid",
  "mcp:connect",
  "resources:read",
  "resources:write",
  "connections:read",
  "connections:invoke",
  "models:read",
  "models:invoke",
  "tools:invoke",
  "secrets:read",
  "agents:invoke",
] as const;
export function safeOAuthReturn(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/oauth/authorize?") || /[\\\r\n]/.test(value))
    return "/dashboard";
  return value;
}
export function validateOAuthRequest(input: Record<string, unknown>) {
  const get = (k: string) => (typeof input[k] === "string" ? (input[k] as string) : "");
  const uri = new URL(get("redirect_uri"));
  if (uri.protocol !== "https:" || uri.username || uri.password || uri.hash)
    throw new Error("Invalid HTTPS callback. Restart from your client.");
  if (get("response_type") !== "code" || !get("client_id"))
    throw new Error("Invalid OAuth request.");
  if (get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(get("code_challenge")))
    throw new Error("PKCE S256 is required.");
  const scopes = [
    ...new Set(
      (get("scope") || "mcp:connect resources:read connections:read").split(/\s+/).filter(Boolean),
    ),
  ];
  if (scopes.some((s) => !(OAUTH_SCOPES as readonly string[]).includes(s)))
    throw new Error("Unsupported OAuth permission.");
  return {
    client_id: get("client_id"),
    redirect_uri: get("redirect_uri"),
    state: get("state"),
    scope: scopes.join(" "),
    code_challenge: get("code_challenge"),
  };
}
