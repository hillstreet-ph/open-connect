import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CHATGPT_ACTIONS, forwardChatGptAction } from "./chatgpt-action.server.ts";

test("separates read actions from consequential writes", () => {
  assert.equal(CHATGPT_ACTIONS.read.has("search"), true);
  assert.equal(CHATGPT_ACTIONS.read.has("execute_plan"), false);
  assert.equal(CHATGPT_ACTIONS.write.has("execute_plan"), true);
  assert.equal(CHATGPT_ACTIONS.write.has("search"), false);
});

test("rejects undocumented actions before gateway execution", async () => {
  const response = await forwardChatGptAction(
    new Request("https://open-connect.site/api/v1/actions/read", {
      method: "POST",
      headers: { authorization: "Bearer test" },
      body: JSON.stringify({ action: "delete_everything" }),
    }),
    "read",
  );
  assert.equal(response.status, 400);
  assert.match(await response.text(), /unsupported_action/);
});

test("requires authentication before forwarding", async () => {
  const response = await forwardChatGptAction(
    new Request("https://open-connect.site/api/v1/actions/read", {
      method: "POST",
      body: JSON.stringify({ action: "search", input: { query: "browser" } }),
    }),
    "read",
  );
  assert.equal(response.status, 401);
  assert.match(await response.text(), /authentication required/i);
});

test("publishes an importable OpenAPI contract and plugin manifest", () => {
  const openapi = JSON.parse(
    readFileSync(new URL("../../public/openapi.json", import.meta.url), "utf8"),
  ) as Record<string, unknown>;
  const manifest = JSON.parse(
    readFileSync(new URL("../../public/.well-known/ai-plugin.json", import.meta.url), "utf8"),
  ) as Record<string, unknown>;
  assert.equal(openapi["openapi"], "3.1.0");
  assert.match(JSON.stringify(openapi), /readOpenConnect/);
  assert.match(JSON.stringify(openapi), /writeOpenConnect/);
  assert.equal(manifest["name_for_model"], "open_connect");
  assert.match(JSON.stringify(manifest), /openapi\.json/);
});
