import { createFileRoute } from "@tanstack/react-router";
import { receiveIncomingWebhook } from "@/lib/incoming-webhook.server";

export const Route = createFileRoute("/api/webhooks/$id")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // Types are generated from the deployed schema.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = supabaseAdmin as any;
        return receiveIncomingWebhook(request, params.id, {
          async lookup(id) {
            const { data, error } = await db
              .from("incoming_webhooks")
              .select("id,user_id,secret_hash")
              .eq("id", id)
              .maybeSingle();
            if (error) throw error;
            return data;
          },
          async save(delivery) {
            const { error } = await db.from("incoming_webhook_deliveries").insert(delivery);
            if (error?.code === "23505") return "duplicate";
            if (error) throw error;
            return "saved";
          },
        });
      },
    },
  },
});
