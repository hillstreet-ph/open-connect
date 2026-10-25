import { normalizeRemoteMcpEndpoint } from "./remote-mcp.ts";
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/cfworker";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export type McpCatalogFailureCode = "pagination_repeated" | "page_limit_exceeded";

export class McpCatalogError extends Error {
  readonly code: McpCatalogFailureCode;

  constructor(code: McpCatalogFailureCode) {
    super(
      code === "pagination_repeated"
        ? "MCP catalog pagination repeated a cursor."
        : "MCP catalog exceeds the supported page limit.",
    );
    this.name = "McpCatalogError";
    this.code = code;
  }
}

/** One initialized session per operation; supports JSON and streamed SSE replies. */
export async function withMcpClient<T>(
  endpoint: string,
  headers: Record<string, string>,
  operation: (client: Client) => Promise<T>,
  send: typeof fetch = fetch,
): Promise<T> {
  const url = new URL(normalizeRemoteMcpEndpoint("custom_mcp", endpoint));
  let responseStatus = 0;
  let responseType = "";
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("MCP requires an HTTPS endpoint without embedded credentials.");
  const deadline = AbortSignal.timeout(60000);
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: { headers, redirect: "manual", cache: "no-store" },
    fetch: async (input, init) => {
      const target = new URL(typeof input === "string" ? input : input.href);
      if (target.origin !== url.origin)
        throw new Error("MCP cross-origin requests are not allowed");
      const response = await send(input, {
        ...init,
        redirect: "manual",
        signal: AbortSignal.any([deadline, ...(init?.signal ? [init.signal] : [])]),
      });
      if (init?.method !== "GET" && init?.method !== "DELETE") {
        responseStatus = response.status;
        responseType = response.headers.get("content-type") ?? "";
      }
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
  } catch (error) {
    if (error instanceof McpCatalogError) throw error;
    // A remote error may echo authorization headers; never forward it to the browser.
    const hint =
      responseStatus === 401 || responseStatus === 403
        ? url.hostname === "connect.composio.dev"
          ? "Composio Connect requires OAuth or a consumer key in x-consumer-api-key. A project API key or personal access token is different."
          : "Authentication was rejected. Check the credential, auth mode and header name. OAuth-only servers require provider authorization."
        : responseStatus === 404 || responseStatus === 405
          ? "Use the exact MCP HTTP endpoint, not a service base URL or dashboard. This client supports Streamable HTTP; legacy SSE-only endpoints require an adapter."
          : responseType.includes("text/html")
            ? "The URL returned a web page. Enter the MCP server endpoint instead of a dashboard URL."
            : deadline.aborted
              ? "The server timed out during MCP initialization or tool discovery. Retry or check provider availability."
              : "Check the endpoint, credential, protocol support, and provider availability.";
    // eslint-disable-next-line preserve-caught-error -- Never forward remote errors that may contain credentials.
    throw new Error(
      `MCP request failed${responseStatus ? ` (HTTP ${responseStatus})` : ""}. ${hint}`,
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
        if (seen.has(cursor)) throw new McpCatalogError("pagination_repeated");
        seen.add(cursor);
      }
      throw new McpCatalogError("page_limit_exceeded");
    },
    send,
  );
}
