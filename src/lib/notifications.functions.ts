import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  notificationReadInput,
  notificationTelegramDestination,
  notificationWebhookUrl,
} from "./notification-dispatch.server";

export type InboxItem = {
  id: string;
  title: string;
  body: string;
  event_type: string;
  read_at: string | null;
  created_at: string;
};
export type AlertChannel = {
  id: string;
  kind: "telegram" | "webhook";
  name: string;
  destination: string;
  topic_id: number | null;
  enabled: boolean;
};
export type AlertDelivery = {
  id: string;
  status: string;
  attempts: number;
  attempted_at: string | null;
  created_at: string;
  status_code: number | null;
  error_message: string | null;
  notification_channels: { name: string; kind: string } | null;
};
const idInput = z.object({ id: z.uuid() });

export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { notificationDatabase } = await import("./notifications.server");
    const db = await notificationDatabase();
    const [items, unread] = await Promise.all([
      db
        .from("notifications")
        .select("id,title,body,event_type,read_at,created_at")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(50),
      db
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", context.userId)
        .is("read_at", null),
    ]);
    if (items.error || unread.error) throw new Error("Could not load notifications.");
    return { items: (items.data ?? []) as InboxItem[], unread: unread.count ?? 0 };
  });

export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(notificationReadInput)
  .handler(async ({ data, context }) => {
    const { notificationDatabase } = await import("./notifications.server");
    const db = await notificationDatabase();
    let query = db
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .is("read_at", null);
    query = data.id ? query.eq("id", data.id) : query.lte("created_at", data.through);
    const { error } = await query;
    if (error) throw new Error("Could not mark notifications read.");
  });

export const listNotificationChannels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { notificationDatabase } = await import("./notifications.server");
    const db = await notificationDatabase();
    const [channels, deliveries] = await Promise.all([
      db
        .from("notification_channels")
        .select("id,kind,name,destination,topic_id,enabled")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false }),
      db
        .from("notification_deliveries")
        .select(
          "id,status,attempts,attempted_at,created_at,status_code,error_message,notification_channels(name,kind)",
        )
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    if (channels.error || deliveries.error)
      throw new Error("Could not load notification destinations.");
    return {
      channels: (channels.data ?? []) as AlertChannel[],
      deliveries: (deliveries.data ?? []) as AlertDelivery[],
    };
  });

export const createNotificationChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        kind: z.enum(["telegram", "webhook"]),
        name: z.string().trim().min(1).max(80),
        destination: z.string().trim().min(1).max(2048),
        topic: z.string().max(16).default(""),
        integration_id: z.uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { notificationDatabase } = await import("./notifications.server");
    const db = await notificationDatabase();
    let credentialReference: string | null = null;
    let secret: string | null = null;
    let secretId: string | null = null;
    let destination: string;
    let topicId: number | null = null;
    if (data.kind === "telegram") {
      const parsed = notificationTelegramDestination(data.destination, data.topic);
      destination = parsed.destination;
      topicId = parsed.topic_id;
      const { data: bot, error } = await db
        .from("inbound_integrations")
        .select("id")
        .eq("id", data.integration_id ?? "00000000-0000-0000-0000-000000000000")
        .eq("provider", "telegram")
        .eq("user_id", context.userId)
        .maybeSingle();
      if (error || !bot) throw new Error("Choose one of your connected Telegram bots.");
    } else {
      destination = notificationWebhookUrl(data.destination);
      secret = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
      const { data: saved, error } = await context.supabase.rpc("create_credential_secret", {
        p_name: "Webhook alerts · " + data.name,
        p_secret_type: "api_key",
        p_scopes: ["notifications:send"],
        p_secret_value: JSON.stringify({ version: 1, credential: secret }),
      });
      secretId = String((saved as { id?: string } | null)?.id ?? "");
      if (error || !secretId) throw new Error("Could not save the signing secret securely.");
      credentialReference = "credential://notification/" + secretId;
    }
    const { error } = await db.from("notification_channels").insert({
      user_id: context.userId,
      kind: data.kind,
      name: data.name,
      destination,
      topic_id: topicId,
      integration_id: data.kind === "telegram" ? data.integration_id : null,
      credential_reference: credentialReference,
    });
    if (error) {
      if (secretId) await context.supabase.rpc("delete_credential_secret", { p_id: secretId });
      throw new Error("Could not save destination. Maximum 10 destinations per account.");
    }
    return { secret };
  });

export const setNotificationChannelEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => idInput.extend({ enabled: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const { notificationDatabase } = await import("./notifications.server");
    const db = await notificationDatabase();
    const { error } = await db
      .from("notification_channels")
      .update({ enabled: data.enabled })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error("Could not update destination.");
  });

export const deleteNotificationChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => idInput.parse(input))
  .handler(async ({ data, context }) => {
    const { notificationDatabase } = await import("./notifications.server");
    const db = await notificationDatabase();
    const { data: removed, error } = await db
      .from("notification_channels")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .select("credential_reference")
      .maybeSingle();
    if (error) throw new Error("Could not remove destination.");
    const secretId = removed?.credential_reference?.match(
      /^credential:\/\/notification\/([0-9a-f-]{36})$/i,
    )?.[1];
    if (secretId) {
      const result = await context.supabase.rpc("delete_credential_secret", { p_id: secretId });
      if (result.error)
        throw new Error("Destination removed. Delete its remaining secret in Credential Vault.");
    }
  });

export const testNotificationChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => idInput.parse(input))
  .handler(async ({ data, context }) => {
    const { notificationDatabase, deliverNotificationJob } = await import("./notifications.server");
    const db = await notificationDatabase();
    const { data: channel, error: channelError } = await db
      .from("notification_channels")
      .select("id")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .eq("enabled", true)
      .maybeSingle();
    if (channelError || !channel) throw new Error("Enable a destination you own before testing.");
    const { data: event, error } = await db
      .from("notifications")
      .insert({
        user_id: context.userId,
        event_type: "notification.test",
        title: "Test alert",
        body: "Your Open-Connect notification destination is being tested.",
      })
      .select("id")
      .single();
    if (error) throw new Error("Could not create test notification.");
    const { data: job, error: jobError } = await db
      .from("notification_deliveries")
      .insert({ user_id: context.userId, notification_id: event.id, channel_id: channel.id })
      .select("id")
      .single();
    if (jobError) {
      await db.from("notifications").delete().eq("id", event.id).eq("user_id", context.userId);
      throw new Error("Could not queue test notification.");
    }
    await deliverNotificationJob(job.id, context.userId);
    return { queued: true };
  });

export const retryNotificationDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => idInput.parse(input))
  .handler(async ({ data, context }) => {
    const { notificationDatabase, deliverNotificationJob } = await import("./notifications.server");
    const db = await notificationDatabase();
    const cutoff = new Date(Date.now() - 120_000).toISOString();
    const { data: job, error } = await db
      .from("notification_deliveries")
      .update({ status: "pending" })
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .or(`status.eq.failed,status.eq.pending,and(status.eq.sending,attempted_at.lt.${cutoff})`)
      .select("id")
      .maybeSingle();
    if (error || !job) throw new Error("Delivery is already sent or still in progress.");
    await deliverNotificationJob(job.id, context.userId);
  });
