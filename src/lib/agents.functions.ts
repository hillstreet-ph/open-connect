import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function assertMcpUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("Enter a full MCP URL, e.g. https://example.com/mcp");
  }
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("MCP URLs must use https");
  }
  return url.toString();
}

export const listAgentConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("agent_connections")
      .select("id, name, mcp_url, transport, state, created_at, api_keys(key_prefix, name), toolkits(name)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const connectAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name: string; mcpUrl: string; toolkitId?: string | null }) => ({
    name: input.name.trim(),
    mcpUrl: input.mcpUrl,
    toolkitId: input.toolkitId || null,
  }))
  .handler(async ({ data, context }) => {
    if (!data.name) throw new Error("Give this agent a name");
    const mcpUrl = assertMcpUrl(data.mcpUrl);

    const { generateKey } = await import("./gateway.server");
    const key = generateKey();

    const { data: apiKey, error: keyError } = await context.supabase
      .from("api_keys")
      .insert({
        user_id: context.userId,
        name: `${data.name} (agent)`,
        key_prefix: key.prefix,
        key_hash: key.hash,
        scopes: [
          "mcp:connect",
          "resources:read",
          "connections:read",
          "connections:invoke",
          "models:read",
          "models:invoke",
        ],
      })
      .select("id")
      .single();
    if (keyError) throw new Error(keyError.message);

    let state = "ready";
    try {
      const probe = await fetch(mcpUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "open-connect", version: "1.0.0" },
          },
        }),
      });
      if (probe.status === 401 || probe.status === 403) state = "authenticating";
      else if (!probe.ok) state = "failed";
    } catch {
      state = "failed";
    }

    const { data: connection, error } = await context.supabase
      .from("agent_connections")
      .insert({
        user_id: context.userId,
        name: data.name,
        mcp_url: mcpUrl,
        api_key_id: apiKey.id,
        toolkit_id: data.toolkitId,
        state,
        last_checked_at: new Date().toISOString(),
      })
      .select("id, name, state")
      .single();
    if (error) throw new Error(error.message);

    return { connection, key: key.raw };
  });

export const disconnectAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: input.id }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("agent_connections").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
