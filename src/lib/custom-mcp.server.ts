import { fetchMcpTools, withMcpClient } from "./mcp-client.server.ts";

export function connectionAuthHeaders(authType: string, credential: string) {
  if (!credential || authType === "none") return {};
  if (authType === "api_key") return { "X-API-Key": credential };
  return { Authorization: `Bearer ${credential}` };
}

async function resolveCredential(userId: string, reference: string | null) {
  if (!reference) return "";
  const match = reference.match(/^credential:\/\/[^/]+\/([0-9a-f-]{36})$/i);
  if (!match) throw new Error("Connection has an invalid credential reference.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("resolve_connection_credential", {
    p_user_id: userId,
    p_credential_id: match[1]!,
  });
  if (error || typeof data !== "string" || !data) {
    throw new Error("Connection credential could not be resolved.");
  }
  const raw = data;
  try {
    const payload = JSON.parse(raw) as { credential?: unknown };
    return typeof payload.credential === "string" ? payload.credential : raw;
  } catch {
    return raw;
  }
}

export async function getCustomMcpConnection(userId: string, connectionId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("app_connections")
    .select("id,provider,display_name,status,credential_reference,metadata")
    .eq("id", connectionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) throw new Error("Connection not found.");
  if (data.provider !== "custom_mcp") throw new Error("Only Custom MCP connections use this tool.");
  if (data.status !== "connected") throw new Error("Connection is not verified.");
  const metadata = (data.metadata ?? {}) as Record<string, unknown>;
  const endpoint = String(metadata["endpoint_url"] ?? "");
  const authType = String(metadata["auth_type"] ?? "none");
  if (!endpoint.startsWith("https://")) throw new Error("Connection endpoint is not valid.");
  const credential = await resolveCredential(userId, data.credential_reference);
  return {
    id: data.id,
    name: data.display_name,
    endpoint,
    headers: connectionAuthHeaders(authType, credential),
  };
}

export async function listCustomMcpTools(userId: string, connectionId: string) {
  const connection = await getCustomMcpConnection(userId, connectionId);
  const tools = await fetchMcpTools(connection.endpoint, connection.headers);
  return { connection: { id: connection.id, name: connection.name }, tools };
}

export async function callCustomMcpTool(
  userId: string,
  connectionId: string,
  toolName: string,
  args: Record<string, unknown>,
) {
  const connection = await getCustomMcpConnection(userId, connectionId);
  return withMcpClient(connection.endpoint, connection.headers, (client) =>
    client.callTool({ name: toolName, arguments: args }, undefined, { timeout: 30000 }),
  );
}
