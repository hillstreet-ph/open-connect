import type { Json } from "@/integrations/supabase/types";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listIncomingWebhooks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    const { data, error } = await db
      .from("incoming_webhooks")
      .select("id,name,created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error("Could not load webhooks.");
    return (data ?? []) as { id: string; name: string; created_at: string }[];
  });
export const createIncomingWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { name: string }) => ({ name: String(input.name ?? "").trim() }))
  .handler(async ({ data, context }) => {
    if (!data.name || data.name.length > 120) throw new Error("Enter a name up to 120 characters.");
    const { hashWebhookSecret } = await import("@/lib/incoming-webhook.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const secret = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    const { data: row, error } = await db
      .from("incoming_webhooks")
      .insert({
        user_id: context.userId,
        name: data.name,
        secret_hash: await hashWebhookSecret(secret),
      })
      .select("id,name")
      .single();
    if (error) throw new Error("Could not create webhook.");
    return { id: row.id as string, name: row.name as string, secret };
  });
export const deleteIncomingWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => ({ id: String(input.id) }))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    const { error } = await db
      .from("incoming_webhooks")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error("Could not delete webhook.");
  });
export const listIncomingDeliveries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => ({ id: String(input.id) }))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    const { data: rows, error } = await db
      .from("incoming_webhook_deliveries")
      .select("id,delivery_id,payload,received_at")
      .eq("webhook_id", data.id)
      .eq("user_id", context.userId)
      .order("received_at", { ascending: false })
      .limit(25);
    if (error) throw new Error("Could not load deliveries.");
    return (rows ?? []) as {
      id: string;
      delivery_id: string;
      payload: Json;
      received_at: string;
    }[];
  });
