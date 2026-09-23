export type ConnectionSetupInput = {
  provider: string;
  display_name?: string;
  account_label?: string;
  endpoint_url?: string;
  api_key: string;
  auth_type?: "none" | "bearer" | "api_key" | "personal_access_token";
};

export type ConnectionSetupApp = {
  provider: string;
  display_name: string;
  scopes: readonly string[];
  oauth: boolean;
};

export function normalizeConnectionSetup(input: ConnectionSetupInput, app: ConnectionSetupApp) {
  const provider = (input?.provider ?? "").trim().toLowerCase();
  if (app.provider !== provider) throw new Error("Unknown application");
  if (app.oauth) throw new Error("Use provider authorization for this application");

  const apiKey = (input?.api_key ?? "").trim();
  if (provider !== "custom_mcp" && apiKey.length < 8) {
    throw new Error("Credential must contain at least 8 characters");
  }

  const accountLabel = (input?.account_label ?? "Default account").trim().slice(0, 100);
  const displayName = (input?.display_name ?? app.display_name).trim().slice(0, 120);
  const authType = input?.auth_type ?? (provider === "custom_mcp" && !apiKey ? "none" : "bearer");
  if (provider === "custom_mcp" && authType !== "none" && apiKey.length < 8) {
    throw new Error("Credential must contain at least 8 characters when authentication is enabled");
  }
  let endpointUrl = (input?.endpoint_url ?? "").trim();

  if (provider === "custom_mcp") {
    if (!endpointUrl) throw new Error("MCP endpoint URL is required");
    const parsed = new URL(endpointUrl);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
      throw new Error("MCP endpoint must use HTTPS");
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
    endpointUrl = parsed.toString();
  } else if (endpointUrl) {
    const parsed = new URL(endpointUrl);
    if (parsed.protocol !== "https:") throw new Error("Provider endpoint must use HTTPS");
    endpointUrl = parsed.toString();
  }

  return { app, provider, apiKey, accountLabel, displayName, authType, endpointUrl };
}
