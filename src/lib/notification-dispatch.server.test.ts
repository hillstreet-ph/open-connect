import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  notificationReadInput,
  scheduleNotificationTask,
  notificationSignature,
  notificationTelegramDestination,
  notificationWebhookUrl,
  sendNotification,
} from "./notification-dispatch.server.ts";
import {
  dispatchNotificationJob,
  type NotificationJob,
  type NotificationStore,
} from "./notifications.server.ts";

const event = {
  id: "6d1a70a1-b9a2-45b4-b50c-26a59d7c1e01",
  event_type: "webhook.received",
  title: "Webhook received",
  body: "Warehouse · Delivery 123",
  created_at: "2026-10-31T00:00:00Z",
};
const secret = "a".repeat(64);
const token = "123456789:" + "x".repeat(35);

test("outbound alert validates destination and signs the exact body with stable event ID", async () => {
  for (const url of [
    "http://example.com/",
    "https://localhost/",
    "https://127.0.0.1/",
    "https://10.0.0.1/",
    "https://[::1]/",
    "https://user:pass@example.com/",
    "https://example.com:8443/",
    "https://example.com/?token=x",
    "https://example.com/#fragment",
  ])
    assert.throws(() => notificationWebhookUrl(url));
  assert.equal(notificationWebhookUrl("https://example.com/hook"), "https://example.com/hook");
  const signature = await notificationSignature(secret, "123", "body");
  assert.equal(signature, createHmac("sha256", secret).update("123.body").digest("hex"));
  let called = 0;
  const result = await sendNotification(
    { kind: "webhook", destination: "https://example.com/hook", topic_id: null },
    event,
    secret,
    async (input, init) => {
      called++;
      assert.equal(String(input), "https://example.com/hook");
      assert.equal(init?.redirect, "manual");
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("x-open-connect-event-id"), event.id);
      const body = String(init?.body);
      assert.deepEqual(JSON.parse(body), {
        id: event.id,
        type: event.event_type,
        created_at: event.created_at,
        data: { title: event.title, message: event.body },
      });
      assert.equal(
        headers.get("x-open-connect-signature"),
        "sha256=" +
          createHmac("sha256", secret)
            .update(headers.get("x-open-connect-timestamp") + "." + body)
            .digest("hex"),
      );
      assert.ok(!body.includes(secret));
      return new Response(null, { status: 204 });
    },
  );
  assert.equal(called, 1);
  assert.deepEqual(result, { status_code: 204, error_message: null });
});

test("Telegram alerts support private chats and topics without fallback or credential leakage", async () => {
  assert.deepEqual(notificationTelegramDestination("12345", ""), {
    destination: "12345",
    topic_id: null,
  });
  assert.deepEqual(notificationTelegramDestination("-1001234567890", "42"), {
    destination: "-1001234567890",
    topic_id: 42,
  });
  for (const [chat, topic] of [
    ["@user", ""],
    ["0", ""],
    ["1", "0"],
    ["1", "-1"],
    ["1", "1.5"],
    ["1", "NaN"],
    ["9999999999999999", ""],
  ])
    assert.throws(() => notificationTelegramDestination(chat, topic));
  const channel = { kind: "telegram" as const, destination: "-1001234567890", topic_id: 42 };
  const result = await sendNotification(channel, event, token, async (input, init) => {
    assert.equal(String(input), `https://api.telegram.org/bot${token}/sendMessage`);
    const payload = JSON.parse(String(init?.body));
    assert.equal(payload.chat_id, channel.destination);
    assert.equal(payload.message_thread_id, 42);
    assert.ok(payload.text.includes(event.body));
    assert.equal(payload.parse_mode, undefined);
    assert.equal(init?.redirect, "manual");
    return Response.json({ ok: true });
  });
  assert.equal(result.error_message, null);
  let calls = 0;
  const failure = await sendNotification(channel, event, token, async () => {
    calls++;
    throw new Error(token);
  });
  assert.equal(calls, 1);
  assert.ok(failure.error_message);
  assert.ok(!JSON.stringify(failure).includes(token));
});

test("non-2xx including redirects are failures, and Telegram must explicitly acknowledge", async () => {
  for (const status of [301, 401, 429, 500]) {
    const result = await sendNotification(
      { kind: "webhook", destination: "https://example.com/", topic_id: null },
      event,
      secret,
      async () => new Response(null, { status }),
    );
    assert.equal(result.status_code, status);
    assert.ok(result.error_message);
  }
  const telegram = await sendNotification(
    { kind: "telegram", destination: "1234", topic_id: null },
    event,
    token,
    async () => Response.json({ ok: false, description: token }),
  );
  assert.ok(telegram.error_message);
  assert.ok(!JSON.stringify(telegram).includes(token));
});

test("atomic claim sends once, uses the claimed owner, and records failures", async () => {
  const job: NotificationJob = {
    id: "job",
    user_id: "owner",
    notification_id: event.id,
    channel_id: "channel",
    attempts: 0,
  };
  let claimed = false,
    sends = 0,
    finishes = 0;
  const store: NotificationStore = {
    async claim(id, userId) {
      assert.equal(id, job.id);
      if (userId !== job.user_id || claimed) return null;
      claimed = true;
      return job;
    },
    async load(actual) {
      assert.equal(actual.user_id, "owner");
      return {
        event,
        channel: { kind: "webhook", destination: "https://example.com/hook", topic_id: null },
        credential: secret,
      };
    },
    async finish(actual, result) {
      assert.equal(actual.id, job.id);
      assert.equal(result.error_message, null);
      finishes++;
    },
  };
  const send: typeof fetch = async () => {
    sends++;
    return new Response(null, { status: 204 });
  };
  await dispatchNotificationJob(job.id, "other-owner", store, send);
  assert.equal(sends, 0);
  await Promise.all([
    dispatchNotificationJob(job.id, "owner", store, send),
    dispatchNotificationJob(job.id, "owner", store, send),
  ]);
  assert.equal(sends, 1);
  assert.equal(finishes, 1);
  claimed = false;
  store.load = async () => {
    throw new Error(token);
  };
  store.finish = async (_job, result) => {
    assert.ok(result.error_message);
    assert.ok(!result.error_message.includes(token));
  };
  await dispatchNotificationJob(job.id, "owner", store, send);
  assert.equal(sends, 1);
});

test("mark-all accepts PostgREST microseconds and timezone offsets", () => {
  for (const through of [
    "2026-10-31T04:00:00.123456+00:00",
    "2026-10-31T04:00:00Z",
    "2026-10-31T04:00:00+08:00",
  ])
    assert.equal(notificationReadInput({ through }).through, through);
  assert.throws(() => notificationReadInput({}));
  assert.throws(() => notificationReadInput({ through: "not a timestamp" }));
});

test("background dispatch uses runtime waitUntil and never holds receipt response", async () => {
  let finish: (() => void) | undefined;
  let complete = false;
  let registered: Promise<unknown> | undefined;
  const request = Object.assign(new Request("https://example.com/"), {
    waitUntil(work: Promise<unknown>) {
      registered = work;
    },
  });
  scheduleNotificationTask(request, async () => {
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    complete = true;
  });
  await Promise.resolve();
  assert.ok(registered);
  assert.equal(complete, false);
  finish!();
  await registered;
  assert.equal(complete, true);
  scheduleNotificationTask(new Request("https://example.com/"), async () => {
    throw Error("provider secret");
  });
  await new Promise((resolve) => setImmediate(resolve));
});
