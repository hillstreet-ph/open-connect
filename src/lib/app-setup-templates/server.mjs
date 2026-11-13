import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFile } from "node:fs/promises";
const setup = JSON.parse(await readFile(new URL("../setup.json", import.meta.url), "utf8"));
const server = new McpServer({ name: setup.slug, version: "0.1.0" });
server.registerTool(
  "app_status",
  {
    description: "Read this generated app’s name and version. No external service is called.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  async () => ({
    content: [
      {
        type: "text",
        text: JSON.stringify({ name: setup.name, version: "0.1.0", external_integration: false }),
      },
    ],
  }),
);
await server.connect(new StdioServerTransport());
