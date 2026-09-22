import assert from "node:assert/strict";
import test from "node:test";
import { streamableMcpResponse } from "./mcp-transport.server.ts";

const headers = {
  accept: "application/json, text/event-stream",
  "content-type": "application/json",
};

test("returns a Streamable HTTP JSON response for an MCP request", async () => {
  const body = {
    jsonrpc: "2.0" as const,
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "1.0.0" },
    },
  };
  const response = await streamableMcpResponse(
    new Request("https://open-connect.site/mcp", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
    body,
    {
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "open-connect", version: "1.0.1" },
      },
    },
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^application\/json/);
  const payload = (await response.json()) as {
    id: number;
    result: { serverInfo: { name: string } };
  };
  assert.equal(payload.id, 1);
  assert.equal(payload.result.serverInfo.name, "open-connect");
});

test("acknowledges MCP notifications without an invalid JSON-RPC response", async () => {
  const body = { jsonrpc: "2.0" as const, method: "notifications/initialized" };
  const response = await streamableMcpResponse(
    new Request("https://open-connect.site/mcp", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
    body,
    { jsonrpc: "2.0", id: null, result: {} },
  );

  assert.equal(response.status, 202);
  assert.equal(await response.text(), "");
});
