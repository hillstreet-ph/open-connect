import test from "node:test";
import assert from "node:assert/strict";
import {
  CLOUDFLARE_AI_FREE_MODELS,
  getCloudflareAi,
  toOpenAiChatCompletion,
} from "./cloudflare-ai.server.ts";

test("Workers AI responses map to OpenAI-compatible chat completions", () => {
  const completion = toOpenAiChatCompletion("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
    result: { response: "hello there" },
    usage: { prompt_tokens: 3, completion_tokens: 2 },
  });
  assert.equal(completion.object, "chat.completion");
  assert.equal(completion.model, "@cf/meta/llama-3.3-70b-instruct-fp8-fast");
  assert.equal(completion.choices[0]?.message.role, "assistant");
  assert.equal(completion.choices[0]?.message.content, "hello there");
  assert.equal(completion.usage.prompt_tokens, 3);
  assert.equal(completion.usage.total_tokens, 5);
});

test("structured responses are serialized instead of dropped", () => {
  const completion = toOpenAiChatCompletion("@cf/meta/llama-3.1-8b-instruct", {
    result: { response: { nested: true } },
  });
  assert.deepEqual(JSON.parse(completion.choices[0]?.message.content ?? ""), { nested: true });
});

test("missing usage and response still produce a valid completion", () => {
  const completion = toOpenAiChatCompletion("@cf/meta/llama-3.1-8b-instruct", {});
  assert.equal(completion.choices[0]?.message.content, "");
  assert.equal(completion.usage.total_tokens, 0);
});

test("an unbound Workers AI binding resolves to null instead of throwing", async () => {
  assert.equal(await getCloudflareAi(), null);
});

test("the free model list is non-empty and unique", () => {
  assert.ok(CLOUDFLARE_AI_FREE_MODELS.length > 0);
  assert.equal(new Set(CLOUDFLARE_AI_FREE_MODELS).size, CLOUDFLARE_AI_FREE_MODELS.length);
});
