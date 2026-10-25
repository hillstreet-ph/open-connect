export const REMOTE_MCP_PROVIDERS = [
  "custom_mcp",
  "apify_mcp",
  "custom_zeabur_mcp",
  "custom_zeabur",
  "custom_zeabur_bridge",
  "custom_open_teleset",
  "custom_open_system",
  "custom_open_box",
] as const;

export type RemoteMcpProvider = (typeof REMOTE_MCP_PROVIDERS)[number];

export function isRemoteMcpProvider(provider: string): provider is RemoteMcpProvider {
  return REMOTE_MCP_PROVIDERS.includes(provider as RemoteMcpProvider);
}

export type CloudWorkspaceKind = "browser" | "computer" | "terminal" | "phone";

/**
 * Brokered provider connections whose vendor publishes an official hosted MCP
 * endpoint. The endpoint and auth header are fixed here (never read from
 * user-editable metadata), so a stored API key can only be sent to the vendor.
 */
export const HOSTED_MCP_PRESETS = {
  custom_tinyfish_mcp: {
    label: "TinyFish cloud browser",
    endpoint: "https://agent.tinyfish.ai/mcp",
    authType: "api_key",
    kinds: ["browser"],
  },
} as const satisfies Record<
  string,
  {
    label: string;
    endpoint: string;
    authType: "api_key" | "bearer";
    kinds: readonly CloudWorkspaceKind[];
  }
>;

export type HostedMcpProvider = keyof typeof HOSTED_MCP_PRESETS;

export function isHostedMcpProvider(provider: string): provider is HostedMcpProvider {
  return Object.prototype.hasOwnProperty.call(HOSTED_MCP_PRESETS, provider);
}

/** Providers whose tools can be listed and invoked through an MCP client. */
export const EXECUTABLE_MCP_PROVIDERS = [
  ...REMOTE_MCP_PROVIDERS,
  ...(Object.keys(HOSTED_MCP_PRESETS) as HostedMcpProvider[]),
] as const;

export function isExecutableMcpProvider(provider: string) {
  return (
    provider === "custom_api" || isRemoteMcpProvider(provider) || isHostedMcpProvider(provider)
  );
}

/** Cloud workspace pages a connection belongs on. Generic MCP servers fit all. */
export function cloudKindsForProvider(provider: string): readonly CloudWorkspaceKind[] {
  if (provider === "custom_api") return [];
  if (isHostedMcpProvider(provider)) return HOSTED_MCP_PRESETS[provider].kinds;
  return ["browser", "computer", "terminal", "phone"];
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
    (hostname.includes(":") && /^(?:fc|fd|fe8|fe9|fea|feb|::ffff:)/.test(hostname)) ||
    hostname === "::" ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
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
