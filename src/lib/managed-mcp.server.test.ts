import test from "node:test";
import assert from "node:assert/strict";
import { listManagedMcpTools, callManagedMcpTool } from "./managed-mcp.server.ts";
const tool = {
  slug: "TINYFISH_LIST_PROFILES",
  toolkit: { slug: "tinyfish" },
  version: "20261001_00",
  input_parameters: { type: "object", properties: {} },
};
async function fixture(
  run: (
    calls: Array<{ url: string; body: Record<string, unknown> }>,
    state: { owner: string; repeat: boolean; malformed: boolean },
  ) => Promise<void>,
) {
  const fetchBefore = globalThis.fetch,
    keyBefore = process.env["COMPOSIO_API_KEY"],
    mappingBefore = process.env["COMPOSIO_USER_MAPPINGS"];
  process.env["COMPOSIO_API_KEY"] = "fixture-key";
  delete process.env["COMPOSIO_USER_MAPPINGS"];
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const state = { owner: "owner", repeat: false, malformed: false };
  globalThis.fetch = async (input, init) => {
    const url = String(input),
      body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    calls.push({ url, body });
    if (url.includes("/connected_accounts/"))
      return Response.json({
        id: "ca_one",
        user_id: state.owner,
        status: "ACTIVE",
        toolkit: { slug: "tinyfish" },
      });
    if (url.includes("/tools/execute/"))
      return Response.json(
        state.malformed
          ? {}
          : { successful: true, data: { profiles: [], password: "private-value" } },
      );
    if (url.includes("/tools?"))
      return Response.json({ items: [tool], next_cursor: state.repeat ? "repeat" : null });
    return Response.json(tool);
  };
  try {
    await run(calls, state);
  } finally {
    globalThis.fetch = fetchBefore;
    if (keyBefore === undefined) delete process.env["COMPOSIO_API_KEY"];
    else process.env["COMPOSIO_API_KEY"] = keyBefore;
    if (mappingBefore === undefined) delete process.env["COMPOSIO_USER_MAPPINGS"];
    else process.env["COMPOSIO_USER_MAPPINGS"] = mappingBefore;
  }
}
test("managed catalog checks owned active account before discovering toolkit schemas", async () =>
  fixture(async (calls) => {
    const result = await listManagedMcpTools(
      "owner",
      "tinyfish",
      "composio://connected-account/ca_one",
    );
    assert.equal(result[0]?.name, tool.slug);
    assert.ok(calls[0]?.url.includes("/connected_accounts/ca_one"));
    assert.ok(calls[1]?.url.includes("toolkit_slug=tinyfish"));
  }));
test("foreign owner and stalled pagination fail closed", async () =>
  fixture(async (calls, state) => {
    state.owner = "other";
    await assert.rejects(
      listManagedMcpTools("owner", "tinyfish", "composio://connected-account/ca_one"),
      /Managed tool discovery failed/,
    );
    assert.equal(calls.length, 1);
    state.owner = "owner";
    state.repeat = true;
    await assert.rejects(
      listManagedMcpTools("owner", "tinyfish", "composio://connected-account/ca_one"),
      /Managed tool discovery failed/,
    );
  }));
test("execution binds exact owned account and pinned tool version and redacts outputs", async () =>
  fixture(async (calls) => {
    const result = await callManagedMcpTool(
      "owner",
      "tinyfish",
      "composio://connected-account/ca_one",
      tool.slug,
      {},
    );
    assert.equal(result.isError, false);
    const execute = calls.find((call) => call.url.includes("/tools/execute/"));
    assert.equal(execute?.body["connected_account_id"], "ca_one");
    assert.equal(execute?.body["user_id"], "owner");
    assert.equal(execute?.body["version"], "20261001_00");
    assert.doesNotMatch(JSON.stringify(result), /private-value|fixture-key/);
  }));
test("revoked ownership and malformed executor results never report success", async () =>
  fixture(async (calls, state) => {
    state.owner = "other";
    assert.equal(
      (
        await callManagedMcpTool(
          "owner",
          "tinyfish",
          "composio://connected-account/ca_one",
          tool.slug,
          {},
        )
      ).isError,
      true,
    );
    assert.equal(calls.length, 1);
    state.owner = "owner";
    state.malformed = true;
    assert.equal(
      (
        await callManagedMcpTool(
          "owner",
          "tinyfish",
          "composio://connected-account/ca_one",
          tool.slug,
          {},
        )
      ).isError,
      true,
    );
  }));
