import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CATALOG = [
  { provider: "github", display_name: "GitHub", category: "Development", scopes: ["repo", "read:user"] },
  { provider: "google_drive", display_name: "Google Drive", category: "Productivity", scopes: ["drive.readonly"] },
  { provider: "gmail", display_name: "Gmail", category: "Communication", scopes: ["gmail.readonly"] },
  { provider: "slack", display_name: "Slack", category: "Communication", scopes: ["chat:write", "channels:read"] },
  { provider: "notion", display_name: "Notion", category: "Productivity", scopes: ["read_content"] },
  { provider: "linear", display_name: "Linear", category: "Development", scopes: ["read", "write"] },
  { provider: "cloudflare", display_name: "Cloudflare", category: "Infrastructure", scopes: ["zone:read"] },
  { provider: "supabase", display_name: "Supabase", category: "Data", scopes: ["projects:read"] },
] as const;

export const listConnectionCatalog = createServerFn({ method: "GET" }).handler(async () => {
  return CATALOG.map((item) => ({ ...item }));
});

export const listAppConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("app_connections")
      .select("id, provider, display_name, status, scopes, provider_account_id, last_used_at, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const connectApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { provider: string }) => ({
    provider: (input?.provider ?? "").trim().toLowerCase(),
  }))
  .handler(async ({ data, context }) => {
    const app = CATALOG.find((item) => item.provider === data.provider);
    if (!app) throw new Error("Unknown application");

    const credentialReference = `oc_conn_${data.provider}_${context.userId.slice(0, 8)}`;

    const { data: existing } = await context.supabase
      .from("app_connections")
      .select("id")
      .eq("provider", app.provider)
      .eq("user_id", context.userId)
      .maybeSingle();

    if (existing) {
      const { data: updated, error } = await context.supabase
        .from("app_connections")
        .update({
          status: "connected",
          scopes: [...app.scopes],
          credential_reference: credentialReference,
          display_name: app.display_name,
        })
        .eq("id", existing.id)
        .select("id, provider, display_name, status, scopes, created_at")
        .single();
      if (error) throw new Error(error.message);
      return updated;
    }

    const { data: inserted, error } = await context.supabase
      .from("app_connections")
      .insert({
        user_id: context.userId,
        provider: app.provider,
        display_name: app.display_name,
        status: "connected",
        scopes: [...app.scopes],
        credential_reference: credentialReference,
        provider_account_id: context.userId,
        metadata: { source: "open-connect", mode: "capability_grant" },
      })
      .select("id, provider, display_name, status, scopes, created_at")
      .single();
    if (error) throw new Error(error.message);
    return inserted;
  });

export const disconnectApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: input.id }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("app_connections").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
