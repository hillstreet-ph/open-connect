import assert from "node:assert/strict";
import test from "node:test";
import { fetchMcpTools, withMcpClient } from "./mcp-client.server.ts";

function fixture(stream = false) {
  const methods: string[] = [];
  const send: typeof fetch = async (_url, init) => {
    assert.equal(init?.redirect, "manual");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("Authorization"), "Bearer fixture");
    if (init?.method === "GET") return new Response(null, { status: 405 });
    if (init?.method === "DELETE") {
      methods.push("DELETE");
      return new Response(null, { status: 204 });
    }
    const message = JSON.parse(String(init?.body));
    methods.push(message.method);
    if (message.method !== "initialize")
      assert.equal(headers.get("mcp-session-id"), "fixture-session");
    let result;
    if (message.method === "initialize") {
      result = {
        protocolVersion: "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "fixture", version: "1" },
      };
    } else if (message.method === "notifications/initialized")
      return new Response(null, { status: 202 });
    else if (message.method === "tools/list") {
      result = {
        tools: [
          { name: message.params?.cursor ? "second" : "first", inputSchema: { type: "object" } },
        ],
        ...(!message.params?.cursor ? { nextCursor: "page2" } : {}),
      };
    } else if (message.method === "tools/call")
      result = { content: [{ type: "text", text: "done" }] };
    else throw new Error("unexpected method");
    const body = JSON.stringify({ jsonrpc: "2.0", id: message.id, result });
    return stream
      ? new Response(`event: message\ndata: ${body}\n\n`, {
          headers: { "Content-Type": "text/event-stream", "Mcp-Session-Id": "fixture-session" },
        })
      : new Response(body, {
          headers: { "Content-Type": "application/json", "Mcp-Session-Id": "fixture-session" },
        });
  };
  return { send, methods };
}
for (const stream of [false, true]) {
  test(`initializes, preserves sessions and paginates ${stream ? "SSE" : "JSON"} tools`, async () => {
    const f = fixture(stream);
    const tools = await fetchMcpTools(
      "https://mcp.example/mcp",
      { Authorization: "Bearer fixture" },
      f.send,
    );
    assert.deepEqual(
      tools.map((t) => t.name),
      ["first", "second"],
    );
    assert.deepEqual(f.methods, [
      "initialize",
      "notifications/initialized",
      "tools/list",
      "tools/list",
      "DELETE",
    ]);
  });
}
test("initializes a new session before tool invocation and closes it", async () => {
  const f = fixture();
  const result = await withMcpClient(
    "https://mcp.example/mcp",
    { Authorization: "Bearer fixture" },
    (c) => c.callTool({ name: "first", arguments: {} }),
    f.send,
  );
  assert.deepEqual(result.content, [{ type: "text", text: "done" }]);
  assert.deepEqual(f.methods, ["initialize", "notifications/initialized", "tools/call", "DELETE"]);
});
test("redirect and upstream errors never expose response bodies or credentials", async () => {
  for (const status of [302, 401, 500]) {
    await assert.rejects(
      withMcpClient(
        "https://mcp.example/mcp",
        {},
        async () => null,
        async () => new Response("secret", { status }),
      ),
      (e: Error) => !e.message.includes("secret") && e.message.includes("MCP request failed"),
    );
  }
});
