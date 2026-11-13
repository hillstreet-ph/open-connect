import {
  sendNotification,
  type NotificationEvent,
  type NotificationChannel,
} from "./notification-dispatch.server.ts";

export type NotificationJob = {
  id: string;
  user_id: string;
  notification_id: string;
  channel_id: string;
  attempts: number;
};
export type NotificationStore = {
  claim(id: string, userId: string): Promise<NotificationJob | null>;
  load(
    job: NotificationJob,
  ): Promise<{ event: NotificationEvent; channel: NotificationChannel; credential: string } | null>;
  finish(
    job: NotificationJob,
    result: { status_code: number | null; error_message: string | null },
  ): Promise<void>;
};

export async function dispatchNotificationJob(
  id: string,
  userId: string,
  store: NotificationStore,
  send: typeof fetch,
) {
  const job = await store.claim(id, userId);
  if (!job) return;
  let result: { status_code: number | null; error_message: string | null };
  try {
    const input = await store.load(job);
    result = input
      ? await sendNotification(input.channel, input.event, input.credential, send)
      : {
          status_code: null,
          error_message: "Destination is paused, removed, or its credential is unavailable.",
        };
  } catch {
    result = {
      status_code: null,
      error_message: "Could not load the notification destination or credential.",
    };
  }
  await store.finish(job, result);
}

export async function notificationDatabase() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // New tables are not yet in the generated production schema types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabaseAdmin as any;
}

export async function deliverNotificationJob(id: string, userId: string) {
  const db = await notificationDatabase();
  const { publicFetch } = await import("./public-fetch.server.ts");
  await dispatchNotificationJob(
    id,
    userId,
    {
      async claim(jobId, ownerId) {
        const { data, error } = await db
          .from("notification_deliveries")
          .update({
            status: "sending",
            attempted_at: new Date().toISOString(),
            error_message: null,
          })
          .eq("id", jobId)
          .eq("user_id", ownerId)
          .eq("status", "pending")
          .select("id,user_id,notification_id,channel_id,attempts")
          .maybeSingle();
        if (error) throw new Error("Could not claim notification.");
        return data;
      },
      async load(job) {
        const [notification, channelResult] = await Promise.all([
          db
            .from("notifications")
            .select("id,event_type,title,body,created_at")
            .eq("id", job.notification_id)
            .eq("user_id", job.user_id)
            .single(),
          db
            .from("notification_channels")
            .select("kind,destination,topic_id,integration_id,credential_reference,enabled")
            .eq("id", job.channel_id)
            .eq("user_id", job.user_id)
            .single(),
        ]);
        if (notification.error || channelResult.error) throw new Error("Notification unavailable.");
        const channel = channelResult.data;
        if (!channel.enabled) return null;
        let reference = channel.credential_reference;
        if (channel.kind === "telegram") {
          const { data, error } = await db
            .from("inbound_integrations")
            .select("credential_reference")
            .eq("id", channel.integration_id)
            .eq("user_id", job.user_id)
            .eq("provider", "telegram")
            .single();
          if (error) throw new Error("Bot unavailable.");
          reference = data.credential_reference;
        }
        const { resolveCredential } = await import("./custom-mcp.server.ts");
        return {
          event: notification.data,
          channel,
          credential: await resolveCredential(job.user_id, reference),
        };
      },
      async finish(job, result) {
        const { error } = await db
          .from("notification_deliveries")
          .update({
            ...result,
            status: result.error_message ? "failed" : "sent",
            attempts: job.attempts + 1,
          })
          .eq("id", job.id)
          .eq("user_id", job.user_id)
          .eq("status", "sending");
        if (error) throw new Error("Could not record delivery result.");
      },
    },
    publicFetch,
  );
}

export async function dispatchWebhookNotifications(webhookId: string, deliveryId: string) {
  const db = await notificationDatabase();
  const { data: delivery, error } = await db
    .from("incoming_webhook_deliveries")
    .select("id,user_id")
    .eq("webhook_id", webhookId)
    .eq("delivery_id", deliveryId)
    .maybeSingle();
  if (error || !delivery) return;
  const { data: notification } = await db
    .from("notifications")
    .select("id")
    .eq("source_delivery_id", delivery.id)
    .eq("user_id", delivery.user_id)
    .maybeSingle();
  if (!notification) return;
  const { data: jobs } = await db
    .from("notification_deliveries")
    .select("id")
    .eq("notification_id", notification.id)
    .eq("user_id", delivery.user_id)
    .eq("status", "pending")
    .limit(10);
  await Promise.allSettled(
    (jobs ?? []).map((job: { id: string }) => deliverNotificationJob(job.id, delivery.user_id)),
  );
}
