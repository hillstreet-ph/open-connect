import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
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

test("connects with the official MCP client and lists tools", async () => {
  const fetchImpl: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    if (request.method === "GET") {
      return new Response(null, { status: 405 });
    }

    const body = (await request.clone().json()) as {
      jsonrpc: "2.0";
      id?: string | number;
      method: string;
      params?: { protocolVersion?: string };
    };
    if (body.id === undefined) {
      return streamableMcpResponse(request, body, {
        jsonrpc: "2.0",
        id: null,
        result: {},
      });
    }

    const result =
      body.method === "initialize"
        ? {
            protocolVersion: body.params?.protocolVersion ?? "2025-06-18",
            capabilities: { tools: {} },
            serverInfo: { name: "open-connect", version: "1.0.1" },
          }
        : body.method === "tools/list"
          ? {
              tools: [
                {
                  name: "open_connect_status",
                  description: "Check gateway status",
                  inputSchema: { type: "object", properties: {} },
                },
              ],
            }
          : {};

    return streamableMcpResponse(request, body, {
      jsonrpc: "2.0",
      id: body.id,
      result,
    });
  };

  const client = new Client({ name: "open-connect-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL("https://open-connect.site/mcp"), {
    fetch: fetchImpl,
  });
  await client.connect(transport);
  const listed = await client.listTools();

  assert.deepEqual(
    listed.tools.map((tool) => tool.name),
    ["open_connect_status"],
  );
  await client.close();
});
