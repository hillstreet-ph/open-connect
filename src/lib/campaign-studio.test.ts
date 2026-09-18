import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  campaignBriefSchema,
  campaignResultSchema,
  extractGeneratedImages,
  extractResponseText,
} from "./campaign-studio.ts";

test("campaign brief rejects an empty channel selection", () => {
  const result = campaignBriefSchema.safeParse({
    brief: "Launch a useful new product",
    audience: "Developers",
    product: "A secure automation platform",
    tone: "Direct",
    channels: [],
  });
  assert.equal(result.success, false);
});

test("campaign result requires exactly three variants", () => {
  const result = campaignResultSchema.safeParse({
    concept: { name: "One", promise: "Two", direction: "Three" },
    variants: [],
    checklist: ["A", "B", "C"],
    imagePrompts: ["A visual"],
  });
  assert.equal(result.success, false);
});

test("Responses API helpers extract structured text and generated images", () => {
  const payload = {
    output: [
      { type: "message", content: [{ type: "output_text", text: '{"ok":true}' }] },
      { type: "image_generation_call", result: "YWJj", revised_prompt: "Refined visual" },
    ],
  };
  assert.equal(extractResponseText(payload), '{"ok":true}');
  assert.deepEqual(extractGeneratedImages(payload, ["Original visual"]), [
    { dataUrl: "data:image/png;base64,YWJj", prompt: "Refined visual" },
  ]);
});

test("campaign API enforces bearer auth before reading the OpenAI key", () => {
  const route = readFileSync("src/routes/api/campaign-studio.ts", "utf8");
  const authCheck = route.indexOf("authenticatedUserId(request)");
  const keyRead = route.indexOf("process.env.OPENAI_API_KEY");
  assert.ok(authCheck >= 0);
  assert.ok(keyRead > authCheck);
});

test("agent runner reuses a versioned definition and verifies turn completion", () => {
  const runner = readFileSync("scripts/openai-agents-session.sh", "utf8");
  const definition = JSON.parse(readFileSync("config/openai-agent.definition.json", "utf8")) as {
    name: string;
    model: string;
  };
  assert.equal(definition.name, "New agent");
  assert.equal(definition.model, "gpt-6-astra");
  assert.match(runner, /OPENAI_AGENT_RECREATE/);
  assert.match(runner, /agent\.session\.turn\.completed/);
  assert.match(runner, /required_actions/);
});
