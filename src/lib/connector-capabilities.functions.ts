import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
export const refreshConnectorCapabilities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as SupabaseClient;
    const { data: row, error } = await db
      .from("app_connections")
      .select(
        "id,user_id,provider,display_name,status,metadata,updated_at,credential_reference,scopes",
      )
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .single();
    if (error || !row || !["connected", "degraded"].includes(row.status))
      throw new Error("Connect this account before discovery");
    let snapshot: Record<string, unknown>;
    if (row.provider === "custom_api") {
      const { openApiOperations } = await import("./openapi-connector");
      const api = openApiOperations(row.metadata.openapi);
      snapshot = {
        server: { name: api.title },
        tools: api.tools,
        prompts: [],
        resources: [],
        checked_at: new Date().toISOString(),
        catalog_scope: "complete",
      };
    } else if (String(row.metadata.mode) === "custom_mcp" || row.provider === "custom_mcp") {
      const { materializeCustomMcpConnection } = await import("./custom-mcp.server");
      const { fetchMcpSnapshot } = await import("./mcp-client.server");
      const connection = await materializeCustomMcpConnection(row);
      snapshot = await fetchMcpSnapshot(
        connection.endpoint,
        connection.headers,
        connection.transport,
      );
    } else {
      const { listCustomMcpTools } = await import("./custom-mcp.server");
      const catalog = await listCustomMcpTools(context.userId, row.id);
      snapshot = {
        server: { name: row.display_name },
        tools: catalog.tools,
        prompts: [],
        resources: [],
        checked_at: new Date().toISOString(),
        catalog_scope: "tools_only",
      };
    }
    if (row.metadata.auth_type === "oauth") {
      const { activateOAuthConnection } = await import("./oauth-activation.server");
      await activateOAuthConnection(db, context.userId, row, snapshot);
      return { ok: true };
    }
    const { error: saveError } = await db
      .from("app_connections")
      .update({ metadata: { ...row.metadata, capabilities: snapshot } })
      .eq("id", row.id)
      .eq("user_id", context.userId)
      .eq("updated_at", row.updated_at)
      .select("id")
      .single();
    if (saveError) throw new Error("Could not save discovered capabilities");
    return { ok: true };
  });
export const setConnectorToolPermission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string; tool: string; enabled: boolean }) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as SupabaseClient;
    const { data: row, error } = await db
      .from("app_connections")
      .select("metadata,updated_at")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .single();
    if (error || !row) throw new Error("Owned connection not found");
    const tools = row.metadata.capabilities?.tools as Array<{ name: string }> | undefined;
    if (!tools?.some((t) => t.name === data.tool))
      throw new Error("Refresh discovered tools before editing permissions");
    const disabled = new Set<string>(row.metadata.disabled_tools || []);
    if (data.enabled) disabled.delete(data.tool);
    else disabled.add(data.tool);
    const saved = await db
      .from("app_connections")
      .update({ metadata: { ...row.metadata, disabled_tools: [...disabled] } })
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .eq("updated_at", row.updated_at)
      .select("id")
      .single();
    if (saved.error) throw new Error("Connection changed. Refresh before editing permissions");
    return { ok: true };
  });
export const connectorStudioDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { createConnectorDraft } = await import("./connector-draft.server");
    return createConnectorDraft(context.supabase as SupabaseClient, context.userId, data.id);
  });
