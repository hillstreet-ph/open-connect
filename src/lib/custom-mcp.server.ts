import { fetchMcpTools, withMcpClient } from "./mcp-client.server.ts";
import { callTwilioTool, twilioFailureResult, twilioTools } from "./twilio.server.ts";

export function connectionAuthHeaders(authType: string, credential: string) {
  if (!credential || authType === "none") return {};
  if (authType === "api_key") return { "X-API-Key": credential };
  return { Authorization: `Bearer ${credential}` };
}

async function resolveCredential(ownerUserId: string, reference: string | null) {
  if (!reference) return "";
  const match = reference.match(/^credential:\/\/[^/]+\/([0-9a-f-]{36})$/i);
  if (!match) throw new Error("Connection has an invalid credential reference.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("resolve_connection_credential", {
    p_user_id: ownerUserId,
    p_credential_id: match[1]!,
  });
  if (error || typeof data !== "string" || !data) {
    throw new Error("Connection credential could not be resolved.");
  }
  try {
    const payload = JSON.parse(data) as { credential?: unknown };
    return typeof payload.credential === "string" ? payload.credential : data;
  } catch {
    return data;
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
  if (!["custom_mcp", "twilio"].includes(connection.provider)) {
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
    data.provider === "twilio" &&
    !/^credential:\/\/twilio\/[0-9a-f-]{36}$/i.test(data.credential_reference ?? "")
  ) {
    throw new Error("Twilio has an invalid credential reference.");
  }
  return data;
}

async function materializeCustomMcpConnection(data: Awaited<ReturnType<typeof getToolConnection>>) {
  if (data.provider !== "custom_mcp") throw new Error("Only Custom MCP connections use this tool.");

  const metadata = (data.metadata ?? {}) as Record<string, unknown>;
  const endpoint = String(metadata["endpoint_url"] ?? "");
  const authType = String(metadata["auth_type"] ?? "none");
  if (!endpoint.startsWith("https://")) throw new Error("Connection endpoint is not valid.");
  const credential = await resolveCredential(data.user_id, data.credential_reference);
  return {
    id: data.id,
    name: data.display_name,
    endpoint,
    headers: connectionAuthHeaders(authType, credential),
  };
}

export async function getCustomMcpConnection(
  userId: string,
  connectionId: string,
  projectId?: string,
) {
  return materializeCustomMcpConnection(await getToolConnection(userId, connectionId, projectId));
}

export async function listCustomMcpTools(userId: string, connectionId: string, projectId?: string) {
  const saved = await getToolConnection(userId, connectionId, projectId);
  const tools =
    saved.provider === "twilio"
      ? twilioTools(saved.scopes ?? [])
      : await (async () => {
          const connection = await materializeCustomMcpConnection(saved);
          return fetchMcpTools(connection.endpoint, connection.headers);
        })();
  return {
    connection: { id: saved.id, name: saved.display_name, provider: saved.provider },
    tools,
  };
}

export async function callCustomMcpTool(
  userId: string,
  connectionId: string,
  toolName: string,
  args: Record<string, unknown>,
  projectId?: string,
) {
  const connection = await getToolConnection(userId, connectionId, projectId);
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
        throw new Error("The provider action failed and its audit record could not be finalized.", { cause: auditError });
      }
    }
    if (connection.provider === "twilio") return twilioFailureResult(error);
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
