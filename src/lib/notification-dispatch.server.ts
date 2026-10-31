import { z } from "zod";
import { normalizeRemoteMcpEndpoint } from "./remote-mcp.ts";

export type NotificationEvent = {
  id: string;
  event_type: string;
  title: string;
  body: string;
  created_at: string;
};
export type NotificationChannel = {
  kind: "telegram" | "webhook";
  destination: string;
  topic_id: number | null;
};

export function notificationWebhookUrl(value: unknown): string {
  try {
    const endpoint = normalizeRemoteMcpEndpoint("custom_mcp", value);
    const url = new URL(endpoint);
    if ((url.port && url.port !== "443") || url.hash || url.search || endpoint.length > 2048)
      throw new Error();
    return endpoint;
  } catch {
    throw new Error(
      "Use a public HTTPS webhook URL on port 443 without credentials, query, or fragment.",
    );
  }
}

export function notificationTelegramDestination(chat: unknown, topic: unknown) {
  const chatId = String(chat ?? "").trim();
  const topicId = topic === "" || topic === null || topic === undefined ? null : Number(topic);
  if (!/^-?[1-9]\d{0,15}$/.test(chatId) || !Number.isSafeInteger(Number(chatId)))
    throw new Error("Enter a numeric Telegram chat ID.");
  if (topicId !== null && (!Number.isSafeInteger(topicId) || topicId < 1))
    throw new Error("Topic ID must be a positive integer, or leave it blank.");
  return { destination: chatId, topic_id: topicId };
}

export async function notificationSignature(secret: string, timestamp: string, body: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${body}`));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Only notification summaries leave Open-Connect; incoming payloads and credentials never do. */
export async function sendNotification(
  channel: NotificationChannel,
  event: NotificationEvent,
  credential: string,
  send: typeof fetch,
): Promise<{ status_code: number | null; error_message: string | null }> {
  try {
    let response: Response;
    if (channel.kind === "telegram") {
      if (!/^\d{1,20}:[A-Za-z0-9_-]{20,256}$/.test(credential)) throw new Error();
      const destination = notificationTelegramDestination(channel.destination, channel.topic_id);
      response = await send(`https://api.telegram.org/bot${credential}/sendMessage`, {
        method: "POST",
        redirect: "manual",
        signal: AbortSignal.timeout(12_000),
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: destination.destination,
          ...(destination.topic_id ? { message_thread_id: destination.topic_id } : {}),
          text: `${event.title}\n${event.body}\nhttps://open-connect.site/settings#integrations`,
          protect_content: true,
          link_preview_options: { is_disabled: true },
        }),
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean } | null;
      return {
        status_code: response.status,
        error_message:
          response.ok && payload?.ok === true
            ? null
            : "Telegram rejected the alert. Check bot permissions, chat ID and topic.",
      };
    }
    const endpoint = notificationWebhookUrl(channel.destination);
    if (!/^[a-f0-9]{64}$/.test(credential)) throw new Error();
    const body = JSON.stringify({
      id: event.id,
      type: event.event_type,
      created_at: event.created_at,
      data: { title: event.title, message: event.body },
    });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    response = await send(endpoint, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
      headers: {
        "content-type": "application/json",
        "x-open-connect-event-id": event.id,
        "x-open-connect-timestamp": timestamp,
        "x-open-connect-signature": `sha256=${await notificationSignature(credential, timestamp, body)}`,
      },
      body,
    });
    return {
      status_code: response.status,
      error_message: response.ok
        ? null
        : "Webhook rejected the alert. Verify the receiver and its HTTP status.",
    };
  } catch {
    return {
      status_code: null,
      error_message:
        "Delivery could not be confirmed. Check the destination before retrying; it may already have received the alert.",
    };
  }
}

export function notificationReadInput(input: unknown) {
  return z
    .object({ id: z.uuid().optional(), through: z.iso.datetime({ offset: true }).optional() })
    .refine((value) => !!value.id || !!value.through)
    .parse(input);
}

/** Nitro forwards Cloudflare's execution context as Request.waitUntil. Node dev
 * keeps the promise alive naturally. Receipt acknowledgment never waits for sends. */
export function scheduleNotificationTask(request: Request, run: () => Promise<unknown>): void {
  const work = Promise.resolve()
    .then(run)
    .catch(() => undefined);
  const runtimeRequest = request as Request & { waitUntil?: (work: Promise<unknown>) => void };
  if (typeof runtimeRequest.waitUntil === "function") runtimeRequest.waitUntil(work);
}
