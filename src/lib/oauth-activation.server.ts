import type { SupabaseClient } from "@supabase/supabase-js";
export async function activateOAuthConnection(
  db: SupabaseClient,
  userId: string,
  row: {
    id: string;
    provider: string;
    credential_reference: string;
    metadata: Record<string, unknown>;
    scopes: string[];
  },
  snapshot: unknown,
) {
  const target =
    typeof row.metadata["oauth_replace_id"] === "string"
      ? row.metadata["oauth_replace_id"]
      : row.id;
  const previous = await db
    .from("app_connections")
    .select("id,metadata,credential_reference,updated_at")
    .eq("id", target)
    .eq("user_id", userId)
    .eq("provider", row.provider)
    .single();
  if (previous.error || !previous.data) throw new Error("Owned reconnect target not found");
  const saved = await db
    .from("app_connections")
    .update({
      credential_reference: row.credential_reference,
      status: "connected",
      scopes: row.scopes,
      metadata: {
        ...row.metadata,
        capabilities: snapshot,
        disabled_tools: previous.data.metadata.disabled_tools || [],
        oauth_replace_id: null,
        oauth_state_hash: null,
        oauth_expires_at: null,
        oauth_claimed: true,
      },
    })
    .eq("id", target)
    .eq("user_id", userId)
    .eq("updated_at", previous.data.updated_at)
    .select("id")
    .single();
  if (saved.error) throw new Error("Connection changed while authorizing. Retry from Connectors.");
  if (target !== row.id) {
    const removed = await db
      .from("app_connections")
      .delete()
      .eq("id", row.id)
      .eq("user_id", userId);
    if (removed.error)
      throw new Error("Connection activated, but the temporary OAuth record could not be removed");
    const old = previous.data.credential_reference;
    if (old && old !== row.credential_reference) {
      const remaining = await db
        .from("app_connections")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("credential_reference", old);
      if (!remaining.error && remaining.count === 0)
        await db.rpc("delete_credential_secret", { p_id: String(old).split("/").pop() });
    }
  }
  return target as string;
}
