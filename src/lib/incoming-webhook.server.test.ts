import test from "node:test";
import assert from "node:assert/strict";
import {
  constantTimeEqual,
  hashWebhookSecret,
  readWebhookJson,
} from "./incoming-webhook.server.ts";

test("webhook secret hashing and comparison reject invalid secrets", async () => {
  const digest = await hashWebhookSecret("a".repeat(64));
  assert.equal(digest.length, 64);
  assert.equal(constantTimeEqual(digest, await hashWebhookSecret("a".repeat(64))), true);
  assert.equal(constantTimeEqual(digest, await hashWebhookSecret("b".repeat(64))), false);
  assert.equal(constantTimeEqual(digest, "short"), false);
});
test("accepts JSON and rejects malformed or oversized input", async () => {
  assert.deepEqual(
    await readWebhookJson(
      new Request("https://example.test", { method: "POST", body: '{"event":"test"}' }),
    ),
    { event: "test" },
  );
  await assert.rejects(
    readWebhookJson(new Request("https://example.test", { method: "POST", body: "{" })),
  );
  await assert.rejects(
    readWebhookJson(
      new Request("https://example.test", {
        method: "POST",
        body: JSON.stringify("x".repeat(65536)),
      }),
    ),
    /large/,
  );
  for (const body of ['{"a":"\\u0000"}', '{"\\u0000":1}', '{"a":"\\ud800"}', '{"a":1e400}']) {
    await assert.rejects(
      readWebhookJson(new Request("https://example.test", { method: "POST", body })),
      /Unsupported/,
    );
  }
  assert.deepEqual(
    await readWebhookJson(
      new Request("https://example.test", { method: "POST", body: '{"a":"\\\\u0000"}' }),
    ),
    { a: "\\u0000" },
  );
});

test("receiver authenticates, saves owner data once, and reports storage failures", async () => {
  const { receiveIncomingWebhook } = await import("./incoming-webhook.server.ts");
  const id = "00000000-0000-0000-0000-000000000002";
  const secret = "a".repeat(64);
  const saved: unknown[] = [];
  const store = {
    async lookup() {
      return { id, user_id: "owner", secret_hash: await hashWebhookSecret(secret) };
    },
    async save(delivery: unknown) {
      if (saved.length) return "duplicate" as const;
      saved.push(delivery);
      return "saved" as const;
    },
  };
  const request = (key: string) =>
    new Request("https://example.test", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-open-connect-secret": key,
        "x-open-connect-delivery-id": "event-1",
      },
      body: '{"event":"test"}',
    });
  assert.equal((await receiveIncomingWebhook(request("b".repeat(64)), id, store)).status, 401);
  assert.equal(saved.length, 0);
  assert.equal((await receiveIncomingWebhook(request(secret), id, store)).status, 202);
  assert.deepEqual(saved[0], {
    webhook_id: id,
    user_id: "owner",
    delivery_id: "event-1",
    payload: { event: "test" },
  });
  assert.equal((await receiveIncomingWebhook(request(secret), id, store)).status, 200);
  assert.equal(saved.length, 1);
  assert.equal(
    (
      await receiveIncomingWebhook(request(secret), id, {
        ...store,
        async save() {
          throw new Error("db unavailable");
        },
      })
    ).status,
    503,
  );
});
