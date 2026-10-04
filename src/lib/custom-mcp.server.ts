import { fetchMcpTools, withMcpClient } from "./mcp-client.server.ts";

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

export async function getCustomMcpConnection(
  userId: string,
  connectionId: string,
  projectId?: string,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("app_connections")
    .select("id,user_id,provider,display_name,status,credential_reference,metadata")
    .eq("id", connectionId)
    .maybeSingle();
  if (error || !data) throw new Error("Connection not found.");
  if (data.provider !== "custom_mcp") throw new Error("Only Custom MCP connections use this tool.");
  if (data.status !== "connected") throw new Error("Connection is not verified.");

  if (projectId) {
    await assertProjectConnectionAccess(userId, data.user_id, connectionId, projectId);
  } else if (data.user_id !== userId) {
    throw new Error("Connection not found.");
  }

  const metadata = (data.metadata ?? {}) as Record<string, unknown>;
  const endpoint = String(metadata["endpoint_url"] ?? "");
  const authType = String(metadata["auth_type"] ?? "none");
  if (!endpoint.startsWith("https://")) throw new Error("Connection endpoint is not valid.");
  const credential = await resolveCredential(data.user_id, data.credential_reference);
  return { id: data.id, name: data.display_name, endpoint, headers: connectionAuthHeaders(authType, credential) };
}

export async function listCustomMcpTools(userId: string, connectionId: string, projectId?: string) {
  const connection = await getCustomMcpConnection(userId, connectionId, projectId);
  const tools = await fetchMcpTools(connection.endpoint, connection.headers);
  return { connection: { id: connection.id, name: connection.name }, tools };
}

export async function callCustomMcpTool(
  userId: string,
  connectionId: string,
  toolName: string,
  args: Record<string, unknown>,
  projectId?: string,
) {
  const connection = await getCustomMcpConnection(userId, connectionId, projectId);
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

  try {
    const result = await withMcpClient(connection.endpoint, connection.headers, (client) =>
      client.callTool({ name: toolName, arguments: args }, undefined, { timeout: 30000 }),
    );
    if (auditId) {
      await supabaseAdmin
        .from("project_connection_audit")
        .update({ outcome: "succeeded", completed_at: new Date().toISOString() })
        .eq("id", auditId);
    }
    return result;
  } catch (error) {
    if (auditId) {
      await supabaseAdmin
        .from("project_connection_audit")
        .update({ outcome: "failed", error_kind: "provider_action_failed", completed_at: new Date().toISOString() })
        .eq("id", auditId);
    }
    throw error;
  }
}
