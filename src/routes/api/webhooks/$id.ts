import { scheduleNotificationTask } from "@/lib/notification-dispatch.server";
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
        const response = await receiveIncomingWebhook(request, params.id, {
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
        if (response.status === 202 || response.status === 200) {
          // The database trigger durably queues alerts with the receipt. A dispatcher failure
          // must not invalidate a saved receipt; pending work remains visible for manual retry.
          const deliveryId = request.headers.get("x-open-connect-delivery-id")!.trim();
          scheduleNotificationTask(request, async () => {
            const { dispatchWebhookNotifications } = await import("@/lib/notifications.server");
            await dispatchWebhookNotifications(params.id, deliveryId);
          });
        }
        return response;
      },
    },
  },
});
