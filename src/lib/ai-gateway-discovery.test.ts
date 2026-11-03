import test from "node:test";
import assert from "node:assert/strict";
import { AI_GATEWAY_ALIASES, aiGatewayMetadata, llmsTxt } from "./ai-gateway-discovery.ts";

const ISSUER = "https://open-connect.site";

test("gateway discovery metadata is complete and credential-free", () => {
  const meta = aiGatewayMetadata(ISSUER);
  assert.equal(meta.default_model, "open-connect/auto");
  assert.equal(meta.base_url, "https://open-connect.site/v1");
  assert.equal(meta.endpoints.chat_completions, "https://open-connect.site/v1/chat/completions");
  assert.equal(meta.endpoints.mcp, "https://open-connect.site/mcp");
  assert.equal(meta.auth.api_key_prefix, "sk-oc-");
  assert.ok(meta.aliases.includes("open-connect/auto"));
  assert.ok(meta.providers.some((provider) => provider.id === "openrouter"));
  assert.ok(meta.providers.some((provider) => provider.id === "fireworks"));
  const serialized = JSON.stringify(meta);
  assert.ok(!serialized.includes("Bearer sk-oc-real"), "metadata must never embed credentials");
});

test("llms.txt quick start references every discovery surface", () => {
  const text = llmsTxt(ISSUER);
  assert.ok(text.includes("# Open-Connect AI Gateway"));
  assert.ok(text.includes("https://open-connect.site/v1/chat/completions"));
  assert.ok(text.includes("https://open-connect.site/mcp"));
  assert.ok(text.includes("open-connect/auto"));
  for (const alias of AI_GATEWAY_ALIASES) assert.ok(text.includes(alias));
});
