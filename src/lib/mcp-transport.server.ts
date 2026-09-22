import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

export async function streamableMcpResponse(
  request: Request,
  parsedBody: unknown,
  message: JSONRPCMessage,
) {
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
  });
  transport.onerror = (error) => console.error("Open-Connect MCP transport error", error);
  transport.onmessage = async (incoming) => {
    if ("id" in incoming && "id" in message && incoming.id === message.id) {
      await transport.send(message);
    }
  };
  await transport.start();
  return transport.handleRequest(request, { parsedBody });
}
