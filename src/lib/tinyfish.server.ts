import { createTinyFishClient, TINYFISH_PROVIDERS } from "./tinyfish.ts";

export const CLOUD_BROWSER_SETUP_HINT =
  "Connect TinyFish: create an API key at https://agent.tinyfish.ai/api-keys, then add it in Open-Connect → Connections → TinyFish Cloud Browser.";

export class CloudBrowserNotConnectedError extends Error {
  readonly code = "cloud_browser_not_connected";
  constructor() {
    super(CLOUD_BROWSER_SETUP_HINT);
    this.name = "CloudBrowserNotConnectedError";
  }
}

/**
 * The caller's own TinyFish credential. Only vault-backed (credential://)
 * connections owned by the user qualify; brokered OAuth accounts at other
 * providers cannot be used to call the TinyFish REST API.
 */
export async function findCloudBrowserConnection(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("app_connections")
    .select("id,user_id,provider,display_name,credential_reference,updated_at")
    .eq("user_id", userId)
    .in("provider", [...TINYFISH_PROVIDERS])
    .eq("status", "connected")
    .like("credential_reference", "credential://%")
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) throw new Error("Could not load your cloud browser connection.");
  return data?.[0] ?? null;
}

export async function cloudBrowserClient(userId: string, options: { allowBroker?: boolean } = {}) {
  const connection = await findCloudBrowserConnection(userId);
  if (!connection) {
    if (options.allowBroker === false) throw new CloudBrowserNotConnectedError();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("app_connections")
      .select("id,user_id,display_name,credential_reference")
      .eq("user_id", userId)
      .eq("provider", "tinyfish")
      .eq("status", "connected")
      .like("credential_reference", "composio://connected-account/%")
      .order("updated_at", { ascending: false })
      .limit(1);
    if (error) throw new Error("Could not load your brokered TinyFish connection.");
    const saved = data?.[0];
    const accountId = saved?.credential_reference?.match(
      /^composio:\/\/connected-account\/([^/]+)$/,
    )?.[1];
    if (!saved || !accountId) throw new CloudBrowserNotConnectedError();
    const { managedTinyFishClient } = await import("./managed-connectors.server.ts");
    return {
      connection: { id: saved.id, name: saved.display_name },
      client: await managedTinyFishClient(userId, accountId),
    };
  }
  const { resolveCredential } = await import("./custom-mcp.server.ts");
  const apiKey = await resolveCredential(connection.user_id, connection.credential_reference);
  return {
    connection: { id: connection.id, name: connection.display_name },
    client: createTinyFishClient(apiKey),
  };
}

export function cloudBrowserViewUrl(runId?: string) {
  const base = "https://open-connect.site/cloud-browser";
  return runId ? `${base}?run=${encodeURIComponent(runId)}` : base;
}
