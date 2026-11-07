/**
 * Official connection methods per app.
 *
 * Curated providers document which credential types their official APIs
 * accept, and the Composio broker reports the auth schemes each hosted
 * toolkit supports. Both sources merge into the methods the product can
 * complete end to end: a provider sign-in (OAuth), a provider-issued API
 * key or token, or a custom MCP endpoint.
 */

export type ConnectionMethodId = "oauth" | "api_key" | "mcp";

const OAUTH_SCHEMES = new Set(["OAUTH", "OAUTH1", "OAUTH2"]);

/**
 * Curated providers whose official APIs also accept a personal access
 * token, bot token, or API key. These apps can be connected either by
 * signing in with the provider or by entering the provider-issued token
 * through the secure credential dialog.
 */
const PROVIDER_TOKEN_METHODS: ReadonlySet<string> = new Set([
  "github",
  "gitlab",
  "linear",
  "jira",
  "slack",
  "discord",
  "hubspot",
  "airtable",
  "pipedream",
  "railway",
  "hubstaff_admin",
]);

/** Composio auth schemes are upper-case; classify each into a product method. */
export function schemeConnectionMethod(scheme: string): ConnectionMethodId {
  return OAUTH_SCHEMES.has(scheme.toUpperCase()) ? "oauth" : "api_key";
}

/** Hosted toolkit schemes map to the methods the broker can complete for that app. */
export function toolkitConnectionMethods(authMethods: readonly string[]): ConnectionMethodId[] {
  const unique = [...new Set(authMethods.map((scheme) => schemeConnectionMethod(scheme)))];
  return unique.includes("oauth") ? ["oauth", ...unique.filter((m) => m !== "oauth")] : unique;
}

/**
 * The officially supported ways this app can be connected in the product.
 * OAuth sign-in is listed first when available; API key / token follows
 * whenever the provider, its broker schemes, or the curated catalog accept
 * a provider-issued credential.
 */
export function availableConnectionMethods(input: {
  provider: string;
  connectionMethod: string;
  authMethods?: readonly string[];
}): ConnectionMethodId[] {
  const provider = input.provider;
  if (provider === "custom_mcp") return ["mcp"];
  if (provider === "custom_api") return ["api_key"];
  const methods: ConnectionMethodId[] = [];
  if (input.connectionMethod !== "api_key") methods.push("oauth");
  const keyMethod =
    input.connectionMethod === "api_key" ||
    PROVIDER_TOKEN_METHODS.has(provider) ||
    (input.authMethods ?? []).some((scheme) => schemeConnectionMethod(scheme) === "api_key");
  if (keyMethod) methods.push("api_key");
  return methods;
}

// Apps that officially accept API keys or tokens expose them as an equal, first-class
// alternative to hosted sign-in, so users are never locked into a single method.
