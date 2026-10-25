import test from "node:test";
import assert from "node:assert/strict";
import {
  redactDataText,
  redactDataExport,
  validateDataControls,
  defaultDataControls,
} from "./data-controls.ts";
test("automatic capture is independently opt-in for each account", () => {
  assert.equal(defaultDataControls.capture_activity, false);
  assert.equal(defaultDataControls.save_helper_memory, false);
  assert.throws(() => validateDataControls({ ...defaultDataControls, retention_days: 0 }));
  assert.deepEqual(validateDataControls({ ...defaultDataControls, capture_activity: true }), {
    ...defaultDataControls,
    capture_activity: true,
  });
});
test("common credentials are removed from auto memory and nested export fields", () => {
  const raw =
    "api_key=example-hidden-value password: secret-password Bearer hidden-bearer-value sk-oc-abcdefghijklmnop oc_live_abcdefghijk hf_abcdefghijk";
  const clean = redactDataText(raw);
  for (const secret of [
    "example-hidden-value",
    "secret-password",
    "hidden-bearer-value",
    "abcdefghijklmnop",
    "abcdefghijk",
  ])
    assert.ok(!clean.includes(secret));
  assert.deepEqual(
    redactDataExport({
      title: "Keep workflow",
      metadata: { refresh_token: "sensitive" },
      content: raw,
    }),
    { title: "Keep workflow", metadata: { refresh_token: "[REDACTED]" }, content: clean },
  );
});

test("JSON credentials and private keys in text are redacted before saving", () => {
  const json = '{"password":"json-password", "token":"json-token", "cookie":"private-cookie"}';
  const redacted = redactDataText(json);
  for (const secret of ["json-password", "json-token", "private-cookie"])
    assert.ok(!redacted.includes(secret));
});

test("portable exports remove PEM key blocks and URL credentials", () => {
  const value =
    "-----BEGIN PRIVATE KEY-----\nprivate-material\n-----END PRIVATE KEY----- https://test-user:test-password@example.com";
  const cleaned = redactDataText(value);
  for (const secret of ["private-material", "test-user", "test-password"])
    assert.ok(!cleaned.includes(secret));
});

test("repetition groups exact normalized text without treating repetition as verification", async () => {
  const { normalizeRepeatedText, repeatedContext, repeatedPromptDraft } =
    await import("./data-controls.ts");
  assert.equal(normalizeRepeatedText("  My PROMPT\n here "), "my prompt here");
  const metadata = {
    auto_capture: true,
    prompt_hash: "a".repeat(64),
    prompt_summary: "password=hidden-value repeat goal",
  };
  const rows = ["one", "two", "three"].map((id) => ({ id, metadata }));
  const groups = repeatedContext([
    ...rows,
    rows[0]!,
    { id: "other", metadata: { ...metadata, auto_capture: false } },
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0]!.count, 3);
  assert.ok(!groups[0]!.summary.includes("hidden-value"));
  assert.match(repeatedPromptDraft(groups[0]!).content, /unverified suggestion/);
  assert.throws(() => repeatedPromptDraft({ ...groups[0]!, kind: "response" }));
  assert.deepEqual(
    repeatedContext([{ id: "bad", metadata: { ...metadata, prompt_hash: "bad" } }]),
    [],
  );
});

test("host exchange ingestion requires bounded explicit message text", async () => {
  const { validateSharedExchange } = await import("./data-controls.ts");
  assert.deepEqual(validateSharedExchange({ prompt: " goal ", response: " reply " }), {
    prompt: "goal",
    response: "reply",
  });
  assert.throws(() => validateSharedExchange({ prompt: "", response: "reply" }));
  assert.throws(() => validateSharedExchange({ prompt: "x".repeat(8001), response: "reply" }));
  assert.throws(() => validateSharedExchange({ prompt: { history: [] }, response: "reply" }));
});

test("Telegram credentials in raw and URL-encoded provider URLs are redacted", () => {
  const token = "123456789:" + "x".repeat(35);
  for (const value of [token, token.replace(":", "%3A")]) {
    const clean = redactDataText(`https://api.telegram.org/bot${value}/getMe`);
    assert.ok(!clean.includes("x".repeat(35)));
    assert.match(clean, /REDACTED BOT TOKEN/);
  }
});
