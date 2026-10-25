import { normalizeAuthHeader } from "./connection-auth-header.ts";
import { fetchMcpTools, McpCatalogError, withMcpClient } from "./mcp-client.server.ts";
import { callTwilioTool, twilioFailureResult, twilioTools } from "./twilio.server.ts";
import { callTelegramTool, telegramFailureResult, telegramTools } from "./telegram.server.ts";
import {
  HOSTED_MCP_PRESETS,
  isExecutableMcpProvider,
  isHostedMcpProvider,
  type RemoteMcpProvider,
} from "./remote-mcp.ts";

export { isRemoteMcpProvider } from "./remote-mcp.ts";

const REMOTE_MCP_FAILURES = {
  connection_metadata_invalid: {
    message: "The remote MCP endpoint configuration is invalid.",
    retryable: false,
  },
  connection_credential_unavailable: {
    message: "The remote MCP credential is unavailable from the credential broker.",
    retryable: false,
  },
  credential_broker_unavailable: {
    message: "The credential broker is temporarily unavailable.",
    retryable: true,
  },
  remote_mcp_catalog_invalid: {
    message: "The remote MCP tool catalog violates supported pagination limits.",
    retryable: false,
  },
  remote_mcp_unavailable: {
    message: "The remote MCP server did not return a tool catalog.",
    retryable: true,
  },
} as const;

export type RemoteMcpFailureCode = keyof typeof REMOTE_MCP_FAILURES;

export class RemoteMcpDiscoveryError extends Error {
  readonly code: RemoteMcpFailureCode;

  constructor(code: RemoteMcpFailureCode) {
    super(REMOTE_MCP_FAILURES[code].message);
    this.name = "RemoteMcpDiscoveryError";
    this.code = code;
  }
}

export function remoteMcpFailureResult(error: unknown) {
  if (!(error instanceof RemoteMcpDiscoveryError)) return null;
  const failure = REMOTE_MCP_FAILURES[error.code];
  return {
    status: "unavailable",
    code: error.code,
    message: failure.message,
    retryable: failure.retryable,
    secrets_exposed: false,
  };
}

export function connectionAuthHeaders(authType: string, credential: string, authHeader?: unknown) {
  if (!credential || authType === "none") return {};
  if (authType === "api_key") return { [normalizeAuthHeader(authHeader)]: credential };
  return { Authorization: `Bearer ${credential}` };
}

type CredentialResolutionFailureCode =
  "invalid_reference" | "credential_missing" | "broker_unavailable";

export class CredentialResolutionError extends Error {
  readonly code: CredentialResolutionFailureCode;
  readonly retryable: boolean;

  constructor(code: CredentialResolutionFailureCode) {
    super(
      code === "broker_unavailable"
        ? "Credential broker unavailable."
        : "Connection credential is unavailable.",
    );
    this.name = "CredentialResolutionError";
    this.code = code;
    this.retryable = code === "broker_unavailable";
  }
}

export function remoteMcpCredentialFailureCode(error: unknown): RemoteMcpFailureCode {
  return error instanceof CredentialResolutionError && !error.retryable
    ? "connection_credential_unavailable"
    : "credential_broker_unavailable";
}

export function isMissingConnectionCredentialRpcError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const rpcError = error as { code?: unknown; message?: unknown };
  return rpcError.code === "P0001" && rpcError.message === "connection credential not found";
}

/** Resolve a vault credential reference for its owner. Never log or return the value to clients. */
export async function resolveCredential(ownerUserId: string, reference: string | null) {
  if (!reference) return "";
  const match = reference.match(/^credential:\/\/[^/]+\/([0-9a-f-]{36})$/i);
  if (!match) throw new CredentialResolutionError("invalid_reference");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("resolve_connection_credential", {
    p_user_id: ownerUserId,
    p_credential_id: match[1]!,
  });
  if (error) {
    throw new CredentialResolutionError(
      isMissingConnectionCredentialRpcError(error) ? "credential_missing" : "broker_unavailable",
    );
  }
  if (typeof data !== "string" || !data) throw new CredentialResolutionError("credential_missing");
  try {
    const payload = JSON.parse(data) as { credential?: unknown };
    return typeof payload.credential === "string" ? payload.credential : data;
  } catch {
    return data;
  }
}

export async function validateRemoteMcpConfiguration(input: {
  provider: RemoteMcpProvider;
  ownerUserId: string;
  credentialReference: string;
  endpointUrl: string;
  authType: "none" | "bearer" | "api_key" | "personal_access_token";
}) {
  let credential = "";
  try {
    if (input.authType !== "none") {
      credential = await resolveCredential(input.ownerUserId, input.credentialReference);
    }
    const [{ normalizeConnectionSetup }, { validateConnectionCredential }] = await Promise.all([
      import("./connection-setup.ts"),
      import("./connection-validation.server.ts"),
    ]);
    const setup = normalizeConnectionSetup(
      {
        provider: input.provider,
        endpoint_url: input.endpointUrl,
        api_key: credential,
        auth_type: input.authType,
      },
      {
        provider: input.provider,
        display_name: input.provider === "apify_mcp" ? "Apify MCP" : "Custom MCP server",
        scopes: [],
        oauth: false,
      },
    );
    return await validateConnectionCredential(setup);
  } catch (error) {
    if (error instanceof CredentialResolutionError) {
      throw new RemoteMcpDiscoveryError(remoteMcpCredentialFailureCode(error));
    }
    throw new RemoteMcpDiscoveryError("remote_mcp_unavailable");
  }
}

async function assertProjectConnectionAccess(
  actorUserId: string,
  ownerUserId: string,
  connectionId: string,
  projectId: string,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: project, error: projectError } = await supabaseAdmin
    .from("projects")
    .select("organization_id")
    .eq("id", projectId)
    .maybeSingle();
  if (projectError || !project) throw new Error("Project unavailable.");

  const [memberResult, adminResult] = await Promise.all([
    supabaseAdmin
      .from("project_members")
      .select("id")
      .eq("project_id", projectId)
      .eq("user_id", actorUserId)
      .maybeSingle(),
    supabaseAdmin
      .from("organization_members")
      .select("id")
      .eq("organization_id", project.organization_id)
      .eq("user_id", actorUserId)
      .eq("role", "admin")
      .maybeSingle(),
  ]);
  if (memberResult.error || adminResult.error || (!memberResult.data && !adminResult.data)) {
    throw new Error("Project access denied.");
  }

  if (ownerUserId !== actorUserId) {
    const { data: grant, error } = await supabaseAdmin
      .from("project_connections")
      .select("id")
      .eq("project_id", projectId)
      .eq("connection_id", connectionId)
      .maybeSingle();
    if (error || !grant) throw new Error("Connection is not shared with this project.");
  }
}

export async function assertToolConnectionAccess(
  userId: string,
  connection: { id: string; user_id: string; provider: string; status: string },
  projectId?: string,
  checkProject = assertProjectConnectionAccess,
) {
  if (
    !isExecutableMcpProvider(connection.provider) &&
    !["twilio", "telegram"].includes(connection.provider)
  ) {
    throw new Error("No executable adapter is configured for this connection.");
  }
  if (connection.status !== "connected") throw new Error("Connection is not verified.");
  if (projectId) {
    await checkProject(userId, connection.user_id, connection.id, projectId);
  } else if (connection.user_id !== userId) {
    throw new Error("Connection not found.");
  }
}

async function getToolConnection(userId: string, connectionId: string, projectId?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("app_connections")
    .select("id,user_id,provider,display_name,status,credential_reference,metadata,scopes")
    .eq("id", connectionId)
    .maybeSingle();
  if (error || !data) throw new Error("Connection not found.");
  await assertToolConnectionAccess(userId, data, projectId);
  if (
    ["twilio", "telegram"].includes(data.provider) &&
    !new RegExp(`^credential://${data.provider}/[0-9a-f-]{36}$`, "i").test(
      data.credential_reference ?? "",
    )
  ) {
    throw new Error("Native provider has an invalid credential reference.");
  }
  return data;
}

type ToolConnection = Awaited<ReturnType<typeof getToolConnection>>;
type ToolAuthorizer = (
  connection: { id: string; name: string; provider: string },
  tool: Record<string, unknown>,
) => void;

export function authorizeToolForConnectionSnapshot(
  connection: { id: string; display_name: string; provider: string },
  tools: Array<Record<string, unknown>>,
  toolName: string,
  authorizeTool: ToolAuthorizer,
) {
  const tool = tools.find((item) => item["name"] === toolName);
  if (!tool) throw new Error("Tool is no longer available. Refresh the connection.");
  authorizeTool(
    { id: connection.id, name: connection.display_name, provider: connection.provider },
    tool,
  );
  return tool;
}

async function materializeCustomMcpConnection(data: ToolConnection) {
  if (!isExecutableMcpProvider(data.provider))
    throw new Error("Only remote MCP connections use this tool.");

  const metadata = (data.metadata ?? {}) as Record<string, unknown>;
  // Hosted presets ignore stored metadata so a credential only reaches its vendor.
  const preset = isHostedMcpProvider(data.provider) ? HOSTED_MCP_PRESETS[data.provider] : null;
  const endpoint = preset ? preset.endpoint : String(metadata["endpoint_url"] ?? "");
  const authType = preset ? preset.authType : String(metadata["auth_type"] ?? "none");
  try {
    const parsed = new URL(endpoint);
    if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password) {
      throw new Error("invalid endpoint");
    }
  } catch {
    throw new RemoteMcpDiscoveryError("connection_metadata_invalid");
  }
  let credential: string;
  try {
    if (authType !== "none" && !data.credential_reference) {
      throw new CredentialResolutionError("credential_missing");
    }
    credential = await resolveCredential(data.user_id, data.credential_reference);
  } catch (error) {
    throw new RemoteMcpDiscoveryError(remoteMcpCredentialFailureCode(error));
  }
  return {
    id: data.id,
    name: data.display_name,
    endpoint,
    headers: connectionAuthHeaders(
      authType,
      credential,
      preset ? undefined : metadata["auth_header"],
    ),
  };
}

export async function getCustomMcpConnection(
  userId: string,
  connectionId: string,
  projectId?: string,
) {
  return materializeCustomMcpConnection(await getToolConnection(userId, connectionId, projectId));
}

async function listToolsForConnection(saved: ToolConnection) {
  return saved.provider === "twilio"
    ? twilioTools(saved.scopes ?? [])
    : saved.provider === "telegram"
      ? telegramTools(saved.scopes ?? [])
      : await (async () => {
          const connection = await materializeCustomMcpConnection(saved);
          try {
            return await fetchMcpTools(connection.endpoint, connection.headers);
          } catch (error) {
            if (error instanceof McpCatalogError) {
              throw new RemoteMcpDiscoveryError("remote_mcp_catalog_invalid");
            }
            throw new RemoteMcpDiscoveryError("remote_mcp_unavailable");
          }
        })();
}

export async function listCustomMcpTools(userId: string, connectionId: string, projectId?: string) {
  const saved = await getToolConnection(userId, connectionId, projectId);
  return {
    connection: { id: saved.id, name: saved.display_name, provider: saved.provider },
    tools: await listToolsForConnection(saved),
  };
}

export async function callCustomMcpTool(
  userId: string,
  connectionId: string,
  toolName: string,
  args: Record<string, unknown>,
  projectId?: string,
  authorizeTool?: ToolAuthorizer,
) {
  const connection = await getToolConnection(userId, connectionId, projectId);
  if (authorizeTool) {
    const tools = await listToolsForConnection(connection);
    authorizeToolForConnectionSnapshot(connection, tools, toolName, authorizeTool);
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let auditId: string | undefined;
  if (projectId) {
    const { data: audit, error } = await supabaseAdmin
      .from("project_connection_audit")
      .insert({
        project_id: projectId,
        connection_id: connectionId,
        actor_user_id: userId,
        action_name: toolName.slice(0, 256),
        outcome: "started",
      })
      .select("id")
      .single();
    if (error || !audit) throw new Error("Could not record project connection use.");
    auditId = audit.id;
  }

  let result;
  try {
    if (connection.provider === "twilio") {
      result = await callTwilioTool(toolName, args, {
        scopes: connection.scopes ?? [],
        resolveCredential: () =>
          resolveCredential(connection.user_id, connection.credential_reference),
      });
    } else if (connection.provider === "telegram") {
      result = await callTelegramTool(toolName, args, {
        scopes: connection.scopes ?? [],
        metadata: connection.metadata,
        resolveCredential: () =>
          resolveCredential(connection.user_id, connection.credential_reference),
      });
    } else {
      const custom = await materializeCustomMcpConnection(connection);
      result = await withMcpClient(custom.endpoint, custom.headers, (client) =>
        client.callTool({ name: toolName, arguments: args }, undefined, { timeout: 30000 }),
      );
    }
  } catch (error) {
    if (auditId) {
      const { error: auditError } = await supabaseAdmin
        .from("project_connection_audit")
        .update({
          outcome: "failed",
          error_kind: "provider_action_failed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", auditId);
      if (auditError) {
        // eslint-disable-next-line preserve-caught-error -- Provider errors can contain credentials; expose only this safe message.
        throw new Error("The provider action failed and its audit record could not be finalized.");
      }
    }
    if (connection.provider === "twilio") return twilioFailureResult(error);
    if (connection.provider === "telegram") return telegramFailureResult(error);
    throw error;
  }

  if (auditId) {
    const failed = result.isError === true;
    const { error: auditError } = await supabaseAdmin
      .from("project_connection_audit")
      .update({
        outcome: failed ? "failed" : "succeeded",
        error_kind: failed ? "provider_tool_error" : null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", auditId);
    if (auditError) {
      throw new Error(
        failed
          ? "The provider returned an error and its audit record could not be finalized."
          : "The provider action completed, but its audit record could not be finalized. Check provider state before retrying.",
      );
    }
  }
  return result;
}
