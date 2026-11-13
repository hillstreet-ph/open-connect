import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { readFile } from "node:fs/promises";
const setup = JSON.parse(await readFile(new URL("../setup.json", import.meta.url), "utf8"));
if (!process.env.OPEN_CONNECT_MCP_KEY?.startsWith("oc_live_"))
  throw new Error("Set OPEN_CONNECT_MCP_KEY to an Integrations key in your local .env");
const client = new Client({ name: "open-connect-setup", version: "1.0.0" });
try {
  await client.connect(
    new StreamableHTTPClientTransport(new URL("https://open-connect.site/mcp"), {
      requestInit: { headers: { Authorization: `Bearer ${process.env.OPEN_CONNECT_MCP_KEY}` } },
    }),
  );
  const tools = [];
  let cursor;
  for (let page = 0; page < 50; page++) {
    const result = await client.listTools(cursor ? { cursor } : undefined);
    tools.push(...result.tools.map((t) => ({ name: t.name, description: t.description })));
    cursor = result.nextCursor;
    if (!cursor) break;
    if (page === 49) throw new Error("Catalog exceeds inspection limit");
  }
  console.log(JSON.stringify({ initialized: true, toolCount: tools.length, tools }, null, 2));
  if (setup.connection_id) {
    const result = await client.callTool({
      name: "list_connection_tools",
      arguments: { connection_id: setup.connection_id },
    });
    if (result.isError) throw new Error("App discovery failed; check connection access");
    console.log(JSON.stringify(result, null, 2));
  }
} catch {
  console.error(
    "Inspection failed. Check the endpoint, key scopes and connection status. Remote errors are hidden to protect credentials.",
  );
  process.exitCode = 1;
} finally {
  await client.close().catch(() => {});
}
