import { isExecutableMcpProvider } from "./remote-mcp";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
export const listSetupApps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const result = await context.supabase
      .from("app_connections")
      .select("id,display_name,provider,status")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (result.error) throw new Error("Could not load your app connections");
    return (result.data || []).map((row) => ({
      id: row.id,
      name: row.display_name,
      provider: row.provider,
      executionSupported:
        isExecutableMcpProvider(row.provider) || ["twilio", "telegram"].includes(row.provider),
      status: row.status,
    }));
  });
