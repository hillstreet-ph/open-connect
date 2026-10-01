import test from "node:test";
import assert from "node:assert/strict";
import { automationPrompt, generateAutomationResponse } from "./automation-model.server.ts";
const upstream = {
  baseUrl: "https://openrouter.ai/api/v1",
  headers: { Authorization: "Bearer test" },
};
test("requires a bounded explicit prompt", () => {
  for (const prompt of [undefined, {}, " ", "x".repeat(8001)])
    assert.throws(() => automationPrompt({ prompt }));
  assert.equal(automationPrompt({ prompt: " hello " }), "hello");
});
test("uses free model, bounded tokens and does not follow redirects or execute tools", async () => {
  const result = await generateAutomationResponse("Hello", upstream, async (url, options) => {
    assert.equal(url, upstream.baseUrl + "/chat/completions");
    assert.equal(options?.redirect, "manual");
    const body = JSON.parse(String(options?.body));
    assert.equal(body.model, "openrouter/free");
    assert.equal(body.max_tokens, 2048);
    assert.equal(body.tools, undefined);
    return Response.json({ model: "test:free", choices: [{ message: { content: "Hello!" } }] });
  });
  assert.deepEqual(result, { text: "Hello!", model: "test:free" });
});
test("rejects redirects, rate limits, missing text and malformed responses", async () => {
  for (const response of [
    new Response(null, { status: 302 }),
    new Response(null, { status: 429 }),
    Response.json({ choices: [] }),
    Response.json({ choices: [{ message: { content: {} } }] }),
    new Response("invalid"),
  ]) {
    await assert.rejects(generateAutomationResponse("Hello", upstream, async () => response));
  }
});
test("never exposes transport errors and refuses alternative credential destinations", async () => {
  await assert.rejects(
    generateAutomationResponse("Hello", upstream, async () => {
      throw new Error("secret transport detail");
    }),
    (error: Error) => !error.message.includes("secret"),
  );
  await assert.rejects(
    generateAutomationResponse(
      "Hello",
      { ...upstream, baseUrl: "https://example.com" },
      async () => {
        throw new Error("must not fetch");
      },
    ),
    /endpoint/,
  );
});
