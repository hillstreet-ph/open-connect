/** Fixed same-origin endpoint: never send an API key to a user-provided URL. */
export async function testMcpConnection(token: string, send: typeof fetch = fetch) {
  if (!token.trim().startsWith("oc_live_")) throw new Error("Enter an Open Connect API key.");
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    Authorization: `Bearer ${token.trim()}`,
  };
  async function rpc(id: number, method: string, params?: unknown) {
    const response = await send("/mcp", {
      method: "POST",
      headers,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) }),
    });
    if (response.status === 401) throw new Error("Key is invalid or revoked.");
    if (response.status === 403) throw new Error("Key does not have permission to connect.");
    if (!response.ok) throw new Error(`MCP request failed (HTTP ${response.status}).`);
    const body = await response.json().catch(() => {
      throw new Error("MCP returned an invalid JSON response.");
    });
    if (body.error || body.jsonrpc !== "2.0" || body.id !== id || !body.result) {
      throw new Error("MCP returned an invalid or unsuccessful response.");
    }
    return body.result;
  }
  const initialized = await rpc(1, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "open-connect-connection-test", version: "1.0.0" },
  });
  if (!initialized.serverInfo?.name || !initialized.protocolVersion) {
    throw new Error("MCP initialization is incomplete.");
  }
  // The current gateway is stateless; discovery is a read-only request.
  const listed = await rpc(2, "tools/list");
  if (!Array.isArray(listed.tools)) throw new Error("MCP tool discovery failed.");
  return { toolCount: listed.tools.length };
}
