import { createServer } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { executorConfig, invoke, toolsFor } from "./executor.mjs";

const config = executorConfig(process.env);
const token = process.env.PROTON_MCP_BEARER_TOKEN;
if (!token || token.length < 32)
  throw Error("A separate executor bearer token of at least 32 characters is required.");
const digest = (value) => createHash("sha256").update(value).digest();
const tokenHash = digest(`Bearer ${token}`);
let busy = false;
let operationRunning = false;
createServer(async (request, response) => {
  if (request.url !== "/mcp") {
    response.writeHead(404).end();
    return;
  }
  if (!timingSafeEqual(digest(request.headers.authorization ?? ""), tokenHash)) {
    response.writeHead(401, { "www-authenticate": "Bearer", "cache-control": "no-store" }).end();
    return;
  }
  if (request.method !== "POST") {
    response.writeHead(405, { Allow: "POST" }).end();
    return;
  }
  if (busy || operationRunning) {
    response.writeHead(429, { "retry-after": "1" }).end();
    return;
  }
  busy = true;
  const server = new Server(
    { name: "open-connect-proton", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolsFor(config) }));
  server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    if (operationRunning)
      return {
        isError: true,
        content: [
          { type: "text", text: "Executor busy; retry after the active operation completes." },
        ],
      };
    operationRunning = true;
    try {
      const result = await invoke(config, params.name, params.arguments);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      };
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: error.message }] };
    } finally {
      operationRunning = false;
    }
  });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  response.on("close", () => {
    busy = false;
    void transport.close();
    void server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(request, response);
  } catch {
    if (!response.headersSent) response.writeHead(500).end();
    else response.end();
  }
}).listen(Number(process.env.PROTON_MCP_PORT ?? 8788), "127.0.0.1");
