import assert from "node:assert/strict";
import test from "node:test";
import {
  callTelegramTool,
  telegramDestination,
  telegramFailureResult,
  telegramTools,
} from "./telegram.server.ts";
import { assertToolConnectionAccess } from "./custom-mcp.server.ts";

const token = `123456:${"fixture-secret".repeat(3)}`;
const metadata = { telegram_chat_id: "-1001234567890", telegram_message_thread_id: 167 };
const context = (scopes = ["inbound:telegram", "messages:send"]) => ({
  scopes,
  metadata,
  resolveCredential: async () => token,
});

test("Telegram discovery separates bot reads from sending and exposes no ungranted tools", () => {
  assert.deepEqual(telegramTools([]), []);
  assert.deepEqual(
    telegramTools(["inbound:telegram"]).map((t) => t.name),
    ["telegram_bot", "telegram_destination"],
  );
  const tools = telegramTools(["messages:send"]);
  assert.equal(tools.length, 1);
  assert.equal(tools[0]?.annotations["readOnlyHint"], false);
});

test("sends protected plain text only to the saved topic at the fixed Telegram origin", async () => {
  const result = await callTelegramTool(
    "telegram_send_message",
    { text: "Connection check" },
    context(),
    async (input, init) => {
      assert.equal(String(input), `https://api.telegram.org/bot${token}/sendMessage`);
      assert.equal(init?.redirect, "manual");
      assert.equal(init?.method, "POST");
      assert.ok(init?.signal instanceof AbortSignal);
      assert.deepEqual(JSON.parse(String(init?.body)), {
        chat_id: metadata.telegram_chat_id,
        message_thread_id: 167,
        text: "Connection check",
        protect_content: true,
        link_preview_options: { is_disabled: true },
      });
      return Response.json({ ok: true, result: { message_id: 12, message_thread_id: 167 } });
    },
  );
  assert.equal(result.isError, false);
  assert.equal(JSON.parse(result.content[0]!.text).destination.message_thread_id, 167);
});

test("bot identity needs no destination and masks credentials echoed by the provider", async () => {
  const result = await callTelegramTool(
    "telegram_bot",
    {},
    { ...context(), metadata: {} },
    async (input, init) => {
      assert.ok(String(input).endsWith("/getMe"));
      assert.deepEqual(JSON.parse(String(init?.body)), {});
      return Response.json({ ok: true, result: { id: 123456, text: token, bot_token: token } });
    },
  );
  assert.deepEqual(JSON.parse(result.content[0]!.text).data, { id: 123456, text: "[REDACTED]" });
});

test("rejects destination overrides, invalid messages and ungranted writes before secret resolution", async () => {
  let resolved = 0;
  const ctx = {
    ...context(),
    resolveCredential: async () => {
      resolved++;
      return token;
    },
  };
  for (const args of [
    { text: "check", chat_id: "-1009999999999" },
    { text: "check", message_thread_id: 1 },
    { text: "check", parse_mode: "HTML" },
    { text: "check", allow_paid_broadcast: true },
    { text: " " },
    { text: "x".repeat(4097) },
    {},
  ])
    await assert.rejects(
      callTelegramTool("telegram_send_message", args, ctx),
      /Invalid Telegram arguments/,
    );
  await assert.rejects(
    callTelegramTool("telegram_bot", { query: {} }, ctx),
    /Invalid Telegram arguments/,
  );
  await assert.rejects(
    callTelegramTool(
      "telegram_send_message",
      { text: "check" },
      { ...ctx, scopes: ["inbound:telegram"] },
    ),
    /not granted/,
  );
  assert.equal(resolved, 0);
});

test("invalid or absent group topics fail closed before credential resolution", async () => {
  for (const value of [
    {},
    { ...metadata, telegram_chat_id: "@other" },
    { ...metadata, telegram_chat_id: "123456" },
    { ...metadata, telegram_message_thread_id: 0 },
    { ...metadata, telegram_message_thread_id: "167" },
    { ...metadata, telegram_message_thread_id: 1.5 },
    { ...metadata, telegram_message_thread_id: Number.MAX_SAFE_INTEGER + 1 },
  ]) {
    assert.throws(() => telegramDestination(value));
    await assert.rejects(
      callTelegramTool(
        "telegram_send_message",
        { text: "check" },
        {
          ...context(),
          metadata: value,
          resolveCredential: async () => {
            throw new Error("must not resolve");
          },
        },
      ),
      /Telegram/,
    );
  }
});

test("rejected topics, redirects, malformed replies and transport errors do not leak tokens or retry", async () => {
  for (const send of [
    async () => Response.json({ ok: false, error_code: 400, description: token }, { status: 400 }),
    async () =>
      new Response(token, { status: 302, headers: { location: `https://other.example/${token}` } }),
    async () => new Response(token),
    async () => {
      throw new Error(token);
    },
  ]) {
    let requests = 0;
    try {
      await callTelegramTool("telegram_send_message", { text: "check" }, context(), async () => {
        requests++;
        return send();
      });
      assert.fail("request should fail");
    } catch (error) {
      const failure = telegramFailureResult(error);
      assert.equal(failure.isError, true);
      assert.ok(!failure.content[0]!.text.includes(token));
    }
    assert.equal(requests, 1);
  }
  assert.ok(!telegramFailureResult(new Error(token)).content[0]!.text.includes(token));
});

test("Telegram connections retain owner, connected-status and project-sharing checks", async () => {
  const connection = {
    id: "bot-connection",
    user_id: "owner",
    provider: "telegram",
    status: "connected",
  };
  await assertToolConnectionAccess("owner", connection);
  await assert.rejects(assertToolConnectionAccess("other", connection), /not found/);
  await assert.rejects(
    assertToolConnectionAccess("owner", { ...connection, status: "pending" }),
    /not verified/,
  );
  await assert.rejects(
    assertToolConnectionAccess("member", connection, "wrong-project", async () => {
      throw new Error("Connection is not shared with this project.");
    }),
    /not shared/,
  );
});
