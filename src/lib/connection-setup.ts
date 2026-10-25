import { normalizeAuthHeader } from "./connection-auth-header.ts";
import { isRemoteMcpProvider, normalizeRemoteMcpEndpoint } from "./remote-mcp.ts";

export type ConnectionSetupInput = {
  connection_id?: string;
  new_account?: boolean;
  provider: string;
  display_name?: string;
  account_label?: string;
  endpoint_url?: string;
  api_key: string;
  auth_header?: string;
  description?: string;
  transport?: "http" | "sse" | "openapi";
  openapi?: unknown;
  icon_data?: string;
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
  if (!["custom_mcp", "custom_api"].includes(provider) && apiKey.length < 8) {
    throw new Error("Credential must contain at least 8 characters");
  }

  const accountLabel = (input?.account_label ?? "Default account").trim().slice(0, 100);
  const displayName = (input?.display_name ?? app.display_name).trim().slice(0, 120);
  const authType =
    input?.auth_type ??
    (["custom_mcp", "custom_api"].includes(provider) && !apiKey ? "none" : "bearer");
  if (["custom_mcp", "custom_api"].includes(provider) && authType !== "none" && apiKey.length < 8) {
    throw new Error("Credential must contain at least 8 characters when authentication is enabled");
  }
  let endpointUrl = (input?.endpoint_url ?? "").trim();

  if (!["none", "bearer", "api_key", "personal_access_token"].includes(authType))
    throw new Error("Unsupported authentication type");
  const transport = input.transport ?? (provider === "custom_api" ? "openapi" : "http");
  if (!["http", "sse", "openapi"].includes(transport))
    throw new Error("Choose HTTP, SSE or OpenAPI");
  if (provider === "custom_api" && transport !== "openapi")
    throw new Error("API connectors use an OpenAPI definition");
  if (provider === "custom_mcp" && transport === "openapi")
    throw new Error("Choose the API connector type for OpenAPI definitions");
  const iconData = input.icon_data || "";
  if (
    iconData &&
    (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(iconData) || iconData.length > 14000)
  )
    throw new Error("Use a PNG icon up to 10 KB");
  const authHeader = normalizeAuthHeader(input.auth_header);
  const description = String(input.description ?? "")
    .trim()
    .slice(0, 1000);
  if (provider === "custom_api")
    endpointUrl = normalizeRemoteMcpEndpoint("custom_mcp", endpointUrl);
  if (isRemoteMcpProvider(provider)) {
    endpointUrl = normalizeRemoteMcpEndpoint(provider, endpointUrl);
  } else if (endpointUrl) {
    const parsed = new URL(endpointUrl);
    if (parsed.protocol !== "https:") throw new Error("Provider endpoint must use HTTPS");
    endpointUrl = parsed.toString();
  }

  return {
    app,
    provider,
    apiKey,
    accountLabel,
    displayName,
    authType,
    authHeader,
    description,
    endpointUrl,
    transport,
    openapi: input.openapi,
    iconData,
  };
}

/** Detect repeated native setup by its logical account, without comparing or revealing secrets. */
export function duplicateConnectionSetup<T extends { id: string; metadata: unknown }>(
  setup: Pick<
    ReturnType<typeof normalizeConnectionSetup>,
    "accountLabel" | "endpointUrl" | "authType"
  >,
  saved: T[],
) {
  return saved.find((connection) => {
    const metadata = connection.metadata as Record<string, unknown> | null;
    return (
      metadata?.["source"] === "open-connect" &&
      metadata["account_label"] === setup.accountLabel &&
      (metadata["endpoint_url"] || "") === setup.endpointUrl &&
      metadata["auth_type"] === setup.authType
    );
  });
}
