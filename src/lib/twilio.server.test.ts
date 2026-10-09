import assert from "node:assert/strict";
import test from "node:test";
import {
  callTwilioTool,
  twilioFailureResult,
  twilioResourceScope,
  twilioTools,
} from "./twilio.server.ts";
import { assertToolConnectionAccess } from "./custom-mcp.server.ts";

const accountSid = `AC${"a".repeat(32)}`;
const keySid = `SK${"b".repeat(32)}`;
const secret = "fixture-secret-value";
const bundle = JSON.stringify({
  account_sid: accountSid,
  api_key_sid: keySid,
  api_key_secret: secret,
});
const context = (scopes: string[]) => ({ scopes, resolveCredential: async () => bundle });
const resultData = (result: Awaited<ReturnType<typeof callTwilioTool>>) =>
  JSON.parse(result.content[0]!.text);

test("Twilio discovery exposes only granted resource tools", () => {
  assert.deepEqual(
    twilioTools(["messages:read"]).map((t) => t.name),
    ["twilio_messages"],
  );
  assert.deepEqual(twilioTools([]), []);
  assert.equal(twilioTools(["phone-numbers:write"])[0]?.annotations.readOnlyHint, false);
});

test("uses fixed Twilio origin and the resolved account; encodes filters safely", async () => {
  const result = await callTwilioTool(
    "twilio_messages",
    { query: { To: "+13513007502", PageSize: "10", PageToken: "a&b" } },
    context(["messages:read"]),
    async (input, init) => {
      const url = new URL(String(input));
      assert.equal(url.origin, "https://api.twilio.com");
      assert.equal(url.pathname, `/2010-04-01/Accounts/${accountSid}/Messages.json`);
      assert.equal(url.searchParams.get("To"), "+13513007502");
      assert.equal(url.searchParams.get("PageToken"), "a&b");
      assert.equal(init?.redirect, "error");
      assert.equal(
        new Headers(init?.headers).get("authorization"),
        `Basic ${Buffer.from(`${keySid}:${secret}`).toString("base64")}`,
      );
      return Response.json({ messages: [], next_page_uri: null });
    },
  );
  assert.deepEqual(resultData(result).data, { messages: [], next_page_uri: null });
});

test("default edge fetch keeps its required global receiver and uses a string URL", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async function (this: typeof globalThis, input, init) {
    assert.equal(this, globalThis);
    assert.equal(typeof input, "string");
    assert.equal(
      new Headers(init?.headers).get("authorization"),
      `Basic ${btoa(`${keySid}:${secret}`)}`,
    );
    return Response.json({ sid: accountSid });
  };
  try {
    const response = await callTwilioTool("twilio_account", {}, context(["account:read"]));
    assert.equal(resultData(response).status, 200);
  } finally {
    globalThis.fetch = original;
  }
});

test("removes account auth tokens and nested reusable secrets from provider output", async () => {
  const result = await callTwilioTool("twilio_account", {}, context(["account:read"]), async () =>
    Response.json({
      sid: accountSid,
      auth_token: "provider-secret",
      nested: [{ secret: "other-secret", text: `echo ${secret}` }],
    }),
  );
  assert.deepEqual(resultData(result).data, {
    sid: accountSid,
    nested: [{ text: "echo [REDACTED]" }],
  });
});

test("blocks URL injection, other accounts, credential endpoints and mismatched resource SIDs", () => {
  for (const path of [
    "https://evil.example/Messages.json",
    "//evil.example/Messages.json",
    "/../Keys.json",
    "/Messages.json?redirect=evil",
    "/Messages%2f..%2fKeys.json",
    "/Keys.json",
    "/Tokens.json",
    `/Accounts/${accountSid}/Messages.json`,
    `/Messages/PN${"a".repeat(32)}.json`,
  ])
    assert.throws(() => twilioResourceScope(path, "GET"));
});

test("rejects ungranted writes before resolving the credential or making a request", async () => {
  await assert.rejects(
    callTwilioTool(
      "twilio_request",
      { method: "POST", path: "/Messages.json" },
      {
        scopes: ["phone-numbers:write"],
        resolveCredential: async () => {
          throw new Error("must not resolve");
        },
      },
    ),
    /resource scope is not granted/,
  );
});

test("purchasing and deleting require explicit confirmation before secret resolution", async () => {
  for (const args of [
    { method: "POST", path: "/IncomingPhoneNumbers.json" },
    { method: "DELETE", path: `/IncomingPhoneNumbers/PN${"c".repeat(32)}.json` },
  ])
    await assert.rejects(
      callTwilioTool("twilio_request", args, {
        scopes: ["phone-numbers:write"],
        resolveCredential: async () => {
          throw new Error("must not resolve");
        },
      }),
      /requires confirm=true/,
    );
});

test("encodes phone number updates as form data and preserves deliberate empty handlers", async () => {
  const path = `/IncomingPhoneNumbers/PN${"c".repeat(32)}.json`;
  const result = await callTwilioTool(
    "twilio_request",
    { method: "POST", path, body: { FriendlyName: "Test", SmsUrl: "" } },
    context(["phone-numbers:write"]),
    async (_input, init) => {
      assert.equal(init?.method, "POST");
      assert.equal(
        new Headers(init?.headers).get("content-type"),
        "application/x-www-form-urlencoded",
      );
      assert.equal(String(init?.body), "FriendlyName=Test&SmsUrl=");
      return Response.json({ friendly_name: "Test", sms_url: "" });
    },
  );
  assert.equal(resultData(result).data.sms_url, "");
});

test("DELETE accepts 204 and never fabricates a JSON failure", async () => {
  const result = await callTwilioTool(
    "twilio_request",
    { method: "DELETE", path: `/Messages/SM${"d".repeat(32)}.json`, confirm: true },
    context(["messages:write"]),
    async () => new Response(null, { status: 204 }),
  );
  assert.equal(resultData(result).status, 204);
  assert.equal(resultData(result).data, null);
});

test("provider and network errors cannot echo credentials", async () => {
  await assert.rejects(
    callTwilioTool("twilio_account", {}, context(["account:read"]), async () =>
      Response.json({ code: 20003, message: secret }, { status: 401 }),
    ),
    /HTTP 401 \(code 20003\)/,
  );
  await assert.rejects(
    callTwilioTool("twilio_account", {}, context(["account:read"]), async () => {
      throw new Error(secret);
    }),
    (error: unknown) => error instanceof Error && !error.message.includes(secret),
  );
});

test("native tool errors are explicit MCP failures and hide unexpected exception contents", async () => {
  const unexpected = twilioFailureResult(new Error(secret));
  assert.equal(unexpected.isError, true);
  assert.ok(!unexpected.content[0]!.text.includes(secret));
  try {
    await callTwilioTool("twilio_account", {}, context(["account:read"]), async () =>
      Response.json({ code: 20003, message: secret }, { status: 401 }),
    );
    assert.fail("request should fail");
  } catch (error) {
    const failure = twilioFailureResult(error);
    assert.match(failure.content[0]!.text, /HTTP 401/);
    assert.ok(!failure.content[0]!.text.includes(secret));
  }
});

test("invalid bundles and non-flat parameters never reach Twilio", async () => {
  let requests = 0;
  const fetcher: typeof fetch = async () => {
    requests++;
    return Response.json({});
  };
  await assert.rejects(
    callTwilioTool(
      "twilio_account",
      {},
      { scopes: ["account:read"], resolveCredential: async () => "not-json" },
      fetcher,
    ),
  );
  await assert.rejects(
    callTwilioTool("twilio_messages", { query: { To: {} } }, context(["messages:read"]), fetcher),
  );
  await assert.rejects(
    callTwilioTool(
      "twilio_messages",
      { query: { PageSize: "1001" } },
      context(["messages:read"]),
      fetcher,
    ),
  );
  assert.equal(requests, 0);
});

test("connection access denies other owners, pending grants and unsupported providers", async () => {
  const connection = {
    id: "connection-1",
    user_id: "owner",
    provider: "twilio",
    status: "connected",
  };
  await assert.rejects(assertToolConnectionAccess("other", connection), /not found/);
  await assert.rejects(
    assertToolConnectionAccess("owner", { ...connection, status: "pending" }),
    /not verified/,
  );
  await assert.rejects(
    assertToolConnectionAccess("owner", { ...connection, provider: "unsupported" }),
    /No executable adapter/,
  );
  await assertToolConnectionAccess("owner", connection);
});

test("project sharing must pass the existing access check before using another owner's connection", async () => {
  const connection = {
    id: "connection-1",
    user_id: "owner",
    provider: "twilio",
    status: "connected",
  };
  const calls: string[][] = [];
  await assertToolConnectionAccess("member", connection, "project-1", async (...args) => {
    calls.push(args);
  });
  assert.deepEqual(calls, [["member", "owner", "connection-1", "project-1"]]);
  await assert.rejects(
    assertToolConnectionAccess("member", connection, "project-2", async () => {
      throw new Error("Access denied");
    }),
    /Access denied/,
  );
});
