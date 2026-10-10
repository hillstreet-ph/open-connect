import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/cfworker";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

/** One initialized session per operation; supports JSON and streamed SSE replies. */
export async function withMcpClient<T>(
  endpoint: string,
  headers: Record<string, string>,
  operation: (client: Client) => Promise<T>,
  send: typeof fetch = fetch,
): Promise<T> {
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("MCP requires an HTTPS endpoint without embedded credentials.");
  const deadline = AbortSignal.timeout(60000);
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: { headers, redirect: "manual", cache: "no-store" },
    fetch: async (input, init) => {
      const response = await send(input, {
        ...init,
        redirect: "manual",
        signal: AbortSignal.any([deadline, ...(init?.signal ? [init.signal] : [])]),
      });
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        throw new Error("MCP redirects are not allowed.");
      }
      return response;
    },
    reconnectionOptions: {
      maxRetries: 0,
      initialReconnectionDelay: 1000,
      maxReconnectionDelay: 1000,
      reconnectionDelayGrowFactor: 1,
    },
  });
  const client = new Client(
    { name: "open-connect-broker", version: "1.0.0" },
    { capabilities: {}, jsonSchemaValidator: new CfWorkerJsonSchemaValidator() },
  );
  try {
    await client.connect(transport as Parameters<Client["connect"]>[0], { timeout: 20000 });
    return await operation(client);
  } catch {
    // A remote error may echo authorization headers; never forward it to the browser.
    throw new Error(
      "MCP request failed. Check the endpoint, credential, protocol support, and provider availability.",
    );
  } finally {
    await transport.terminateSession().catch(() => undefined);
    await client.close().catch(() => undefined);
  }
}

export async function fetchMcpTools(
  endpoint: string,
  headers: Record<string, string>,
  send: typeof fetch = fetch,
) {
  return withMcpClient(
    endpoint,
    headers,
    async (client) => {
      const tools: Array<Record<string, unknown>> = [];
      let cursor: string | undefined;
      const seen = new Set<string>();
      for (let page = 0; page < 50; page++) {
        const result = await client.listTools(cursor ? { cursor } : undefined, { timeout: 20000 });
        tools.push(...result.tools);
        cursor = result.nextCursor;
        if (!cursor) return tools;
        if (seen.has(cursor)) throw new Error("MCP pagination repeated a cursor.");
        seen.add(cursor);
      }
      throw new Error("MCP catalog exceeds the supported page limit.");
    },
    send,
  );
}
