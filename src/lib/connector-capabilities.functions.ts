import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type ConnectionRow = {
  id: string;
  user_id: string;
  provider: string;
  display_name: string | null;
  status: string;
  metadata: Record<string, unknown>;
  updated_at: string;
  credential_reference: string | null;
  scopes: string[] | null;
};

const CAPABILITY_STALE_MS = 3600000;
const CONNECTION_COLUMNS =
  "id,user_id,provider,display_name,status,metadata,updated_at,credential_reference,scopes";

function capabilitiesAge(metadata: Record<string, unknown>) {
  const capabilities = metadata["capabilities"] as { checked_at?: string } | undefined;
  const checkedAt = Date.parse(String(capabilities?.checked_at || ""));
  if (!capabilities || !Number.isFinite(checkedAt)) return Infinity;
  return Date.now() - checkedAt;
}

/**
 * Discover the usable capabilities (tools, prompts, resources) of one owned
 * connected app and persist the snapshot. Shared by the manual per-connection
 * refresh and the automatic session sync so both stay identical.
 */
async function discoverConnectionCapabilities(
  db: SupabaseClient,
  userId: string,
  row: ConnectionRow,
): Promise<"saved" | "activated" | "skipped"> {
  if (!["connected", "degraded"].includes(row.status)) return "skipped";
  const metadata = row.metadata ?? {};
  let snapshot: Record<string, unknown>;
  if (row.provider === "custom_api") {
    const { openApiOperations } = await import("./openapi-connector");
    const api = openApiOperations(metadata["openapi"] as never);
    snapshot = {
      server: { name: api.title },
      tools: api.tools,
      prompts: [],
      resources: [],
      checked_at: new Date().toISOString(),
      catalog_scope: "complete",
    };
  } else if (String(metadata["mode"]) === "custom_mcp" || row.provider === "custom_mcp") {
    const { materializeCustomMcpConnection } = await import("./custom-mcp.server");
    const { fetchMcpSnapshot } = await import("./mcp-client.server");
    const connection = await materializeCustomMcpConnection(
      row as Parameters<typeof materializeCustomMcpConnection>[0],
    );
    snapshot = await fetchMcpSnapshot(
      connection.endpoint,
      connection.headers,
      connection.transport,
    );
  } else {
    const { discoverOwnedConnectionTools } = await import("./custom-mcp.server");
    const tools = await discoverOwnedConnectionTools(userId, row.id);
    snapshot = {
      server: { name: row.display_name },
      tools,
      prompts: [],
      resources: [],
      checked_at: new Date().toISOString(),
      catalog_scope: "tools_only",
    };
  }
  if (metadata["auth_type"] === "oauth") {
    const { activateOAuthConnection } = await import("./oauth-activation.server");
    await activateOAuthConnection(
      db,
      userId,
      row as Parameters<typeof activateOAuthConnection>[2],
      snapshot,
    );
    return "activated";
  }
  const { error: saveError } = await db
    .from("app_connections")
    .update({ metadata: { ...metadata, capabilities: snapshot } })
    .eq("id", row.id)
    .eq("user_id", userId)
    .eq("updated_at", row.updated_at)
    .select("id")
    .single();
  if (saveError) return "skipped";
  return "saved";
}

export const refreshConnectorCapabilities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as SupabaseClient;
    const { data: row, error } = await db
      .from("app_connections")
      .select(CONNECTION_COLUMNS)
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .single();
    if (error || !row || !["connected", "degraded"].includes(row.status))
      throw new Error("Connect this account before discovery");
    const outcome = await discoverConnectionCapabilities(
      db,
      context.userId,
      row as unknown as ConnectionRow,
    );
    if (outcome === "skipped") throw new Error("Could not save discovered capabilities");
    return { ok: true };
  });

/**
 * Automatic capability sync for every connected app owned by the caller.
 * Stale connections (no snapshot, or older than one hour) are refreshed so new
 * tools, skills, and resources exposed by a connected app become usable
 * without manual action. Discovered capabilities are enabled by default;
 * users only opt out per tool via setConnectorToolPermission.
 */
export const autoSyncConnectorCapabilities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { limit?: number }) => ({
    limit: Math.min(Math.max(Number(input?.limit ?? 10), 1), 25),
  }))
  .handler(async ({ data, context }) => {
    const db = context.supabase as SupabaseClient;
    const { data: rows, error } = await db
      .from("app_connections")
      .select(CONNECTION_COLUMNS)
      .eq("user_id", context.userId)
      .in("status", ["connected", "degraded"]);
    if (error) throw new Error(error.message);
    const all = (rows ?? []) as unknown as ConnectionRow[];
    const stale = all.filter((row) => capabilitiesAge(row.metadata ?? {}) > CAPABILITY_STALE_MS);
    const results = await Promise.allSettled(
      stale
        .slice(0, data.limit)
        .map((row) => discoverConnectionCapabilities(db, context.userId, row)),
    );
    const refreshed = results.filter(
      (result) =>
        result.status === "fulfilled" && (result.value === "saved" || result.value === "activated"),
    ).length;
    return {
      refreshed,
      deferred: Math.max(stale.length - data.limit, 0),
      checked: all.length,
    };
  });
export const setConnectorToolPermission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      id: string;
      tool: string;
      enabled: boolean;
      kind?: "tools" | "skills" | "apps" | undefined;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as SupabaseClient;
    const { data: row, error } = await db
      .from("app_connections")
      .select("metadata,updated_at")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .single();
    if (error || !row) throw new Error("Owned connection not found");
    const kind = data.kind ?? "tools";
    const field =
      kind === "skills"
        ? "disabled_skills"
        : kind === "apps"
          ? "disabled_toolkits"
          : "disabled_tools";
    const metadata = row.metadata as Record<string, unknown>;
    const disabled = new Set<string>((metadata[field] as string[] | undefined) || []);
    if (data.enabled) disabled.delete(data.tool);
    else disabled.add(data.tool);
    const saved = await db
      .from("app_connections")
      .update({ metadata: { ...row.metadata, [field]: [...disabled] } })
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
