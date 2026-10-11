export const REMOTE_MCP_PROVIDERS = ["custom_mcp", "apify_mcp"] as const;

export type RemoteMcpProvider = (typeof REMOTE_MCP_PROVIDERS)[number];

export function isRemoteMcpProvider(provider: string): provider is RemoteMcpProvider {
  return REMOTE_MCP_PROVIDERS.includes(provider as RemoteMcpProvider);
}

export function normalizeRemoteMcpEndpoint(provider: string, value: unknown) {
  if (!isRemoteMcpProvider(provider)) throw new Error("Remote MCP provider required");
  const endpoint = String(value ?? "").trim();
  if (!endpoint) throw new Error("MCP endpoint URL is required");
  const parsed = new URL(endpoint);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error("MCP endpoint must use HTTPS without embedded credentials");
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    /^(?:0\.|127\.|10\.|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(
      hostname,
    ) ||
    hostname === "::1" ||
    /^(?:fc|fd|fe8|fe9|fea|feb)/.test(hostname) ||
    hostname.endsWith(".local")
  ) {
    throw new Error("MCP endpoint cannot target a private network address");
  }
  if (provider === "apify_mcp" && parsed.origin !== "https://mcp.apify.com") {
    throw new Error("Apify MCP endpoint must use https://mcp.apify.com");
  }
  return parsed.toString();
}

export function normalizeRemoteMcpAuthType(value: unknown) {
  const authType = String(value ?? "bearer");
  if (!["none", "bearer", "api_key", "personal_access_token"].includes(authType)) {
    throw new Error("Unsupported remote MCP authentication type");
  }
  return authType;
}
