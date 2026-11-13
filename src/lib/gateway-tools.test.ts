import test from "node:test";
import assert from "node:assert/strict";
import { GATEWAY_TOOLS, GATEWAY_TOOLS_USAGE } from "./gateway-tools.ts";

test("gateway tool catalog is unique, grouped, and documented", () => {
  const ids = GATEWAY_TOOLS.map((tool) => tool.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const tool of GATEWAY_TOOLS) {
    assert.ok(tool.id.startsWith("openrouter:"), tool.id);
    assert.ok(tool.name.length > 0, tool.id);
    assert.ok(tool.group.length > 0, tool.id);
    assert.ok(tool.detail.length > 0, tool.id);
  }
});

test("usage example targets the gateway with a real tool", () => {
  assert.ok(GATEWAY_TOOLS_USAGE.includes("https://open-connect.site/v1/chat/completions"));
  assert.ok(GATEWAY_TOOLS_USAGE.includes("open-connect/auto"));
  assert.ok(GATEWAY_TOOLS_USAGE.includes("openrouter:web_search"));
});
