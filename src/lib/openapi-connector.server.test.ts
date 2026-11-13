import test from "node:test";
import assert from "node:assert/strict";
import { callOpenApiTool } from "./openapi-connector.server.ts";
import { PROVIDER_API_PRESETS } from "./provider-api-presets.ts";

test("Anthropic Admin requests send the fixed version and selected account key to the official origin", async () => {
  const preset = PROVIDER_API_PRESETS[1];
  for (const [tool, args] of [
    ["anthropic_list_workspaces", {}],
    ["anthropic_create_workspace", { body: { name: "Fixture" } }],
  ] as const) {
    await callOpenApiTool(
      { metadata: { openapi: preset.schema, auth_type: "api_key", auth_header: "x-api-key" } },
      tool,
      args,
      "fixture-admin-key",
      async (url, init) => {
        assert.equal(String(url), "https://api.anthropic.com/v1/organizations/workspaces");
        const headers = new Headers(init?.headers);
        assert.equal(headers.get("anthropic-version"), "2023-06-01");
        assert.equal(headers.get("x-api-key"), "fixture-admin-key");
        assert.equal(headers.get("authorization"), null);
        return Response.json({ data: [] });
      },
    );
  }
});

test("OpenAI organization requests retain Bearer authentication without Anthropic headers", async () => {
  await callOpenApiTool(
    { metadata: { openapi: PROVIDER_API_PRESETS[0].schema, auth_type: "bearer" } },
    "openai_list_projects",
    {},
    "fixture-openai-key",
    async (url, init) => {
      assert.equal(String(url), "https://api.openai.com/v1/organization/projects");
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("authorization"), "Bearer fixture-openai-key");
      assert.equal(headers.get("anthropic-version"), null);
      return Response.json({ data: [] });
    },
  );
});
