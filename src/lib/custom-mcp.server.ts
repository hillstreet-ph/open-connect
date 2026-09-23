type JsonRpcResponse = { result?: unknown; error?: { code?: number; message?: string } };

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

async function rpc(
  endpoint: string,
  headers: Record<string, string>,
  id: number,
  method: string,
  params?: unknown,
) {
  const response = await fetch(endpoint, {
    method: "POST",
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
    headers: {
      ...headers,
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) }),
  });
  if (!response.ok) throw new Error(`Connected MCP request failed (HTTP ${response.status}).`);
  const payload = (await response.json().catch(() => null)) as JsonRpcResponse | null;
  if (!payload) throw new Error("Connected MCP returned invalid JSON.");
  if (payload.error) throw new Error(payload.error.message || "Connected MCP returned an error.");
  return payload.result;
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
  await rpc(connection.endpoint, connection.headers, 1, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "open-connect-broker", version: "1.0.0" },
  });
  const result = (await rpc(connection.endpoint, connection.headers, 2, "tools/list")) as {
    tools?: Array<Record<string, unknown>>;
  };
  return { connection: { id: connection.id, name: connection.name }, tools: result.tools ?? [] };
}

export async function callCustomMcpTool(
  userId: string,
  connectionId: string,
  toolName: string,
  args: Record<string, unknown>,
) {
  const connection = await getCustomMcpConnection(userId, connectionId);
  return rpc(connection.endpoint, connection.headers, 3, "tools/call", {
    name: toolName,
    arguments: args,
  });
}
