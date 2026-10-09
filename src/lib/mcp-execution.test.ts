import { beforeEach, expect, mock, test } from "bun:test";

let post: (args: { request: Request }) => Promise<Response>;
let authenticated = true;
let roles = ["admin"];
let scopes = ["mcp:connect", "control:write"];
let keyBoundary: Record<string, string> = {};
let managedReads = 0;
const resource = {
  slug: "fixture-approved-tool",
  name: "Approved fixture",
  description: null,
  resource_type: "tool",
  installation_type: "mcp",
  installation_config: { review_state: "approved" },
  verified: true,
};
const tables: string[] = [];
let connectionProvider = "twilio";
let connectionReadOnly = false;
let connectionError = false;
const connectionCalls: unknown[] = [];

mock.module("@/lib/managed-connectors.server", () => ({
  listOwnedManagedConnections: async (userId: string) => {
    expect(userId).toBe("fixture-user");
    managedReads++;
    return [{ id: "ca_fixture", provider: "gmail" }];
  },
  listComposioToolkits: async () => [{ slug: "gmail", name: "Gmail" }],
}));

mock.module("@/lib/custom-mcp.server", () => ({
  listCustomMcpTools: async () => ({
    connection: { id: "fixture-connection", provider: connectionProvider },
    tools: [{ name: "fixture-operation", annotations: { readOnlyHint: connectionReadOnly } }],
  }),
  callCustomMcpTool: async (...args: unknown[]) => {
    connectionCalls.push(args);
    return { content: [{ type: "text", text: "{}" }], isError: connectionError };
  },
}));

mock.module("@tanstack/react-router", () => ({
  createFileRoute: () => (options: { server: { handlers: { POST: typeof post } } }) => {
    post = options.server.handlers.POST;
    return options;
  },
}));
mock.module("@/lib/gateway.server", () => ({
  authenticateKey: async () =>
    authenticated ? { userId: "fixture-user", scopes, ...keyBoundary } : null,
  hasScope: (_key: unknown, scope: string) => scopes.includes(scope),
  json: (body: unknown) => Response.json(body),
  gatewayError: (message: string, status: number) => Response.json({ error: message }, { status }),
  logGatewayRequest: async () => undefined,
}));
mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      tables.push(table);
      if (table === "resources")
        return {
          select: () => ({
            eq: () => ({
              order: () => ({ limit: async () => ({ data: [resource] }) }),
            }),
          }),
        };
      if (table === "user_roles")
        return {
          select: () => ({
            eq: async () => ({ data: roles.map((role) => ({ role })) }),
          }),
        };
      if (table === "app_connections")
        return {
          select: () => ({
            eq: () => ({
              order: () => ({ range: async () => ({ data: [], error: null }) }),
            }),
          }),
        };
      throw new Error(`Unexpected database access: ${table}`);
    },
  },
}));
mock.module("@/lib/oauth-client.server", () => ({
  oauthDatabase: () => ({
    from: (table: string) => {
      tables.push(table);
      if (table !== "resources") throw new Error(`Unexpected public query: ${table}`);
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              order: () => ({
                range: async () => ({ data: [resource], error: null }),
              }),
            }),
          }),
        }),
      };
    },
  }),
}));
await import("../routes/mcp");

beforeEach(() => {
  authenticated = true;
  roles = ["admin"];
  scopes = ["mcp:connect", "control:write"];
  tables.length = 0;
  resource.verified = true;
  connectionProvider = "twilio";
  connectionReadOnly = false;
  connectionError = false;
  connectionCalls.length = 0;
  managedReads = 0;
  keyBoundary = {};
});

test("Composio preview performs owned-account reads without import or project writes", async () => {
  scopes = ["mcp:connect", "connections:read"];
  const response = await call("preview_composio_sync");
  const { result } = await response.json();
  const plan = JSON.parse(result.content[0].text);
  expect(plan.dry_run).toBe(true);
  expect(plan.candidates).toEqual([
    { account_id: "ca_fixture", provider: "gmail", display_name: "Gmail" },
  ]);
  expect(managedReads).toBe(1);
  expect(tables).toEqual(["user_roles", "app_connections"]);
});

test("Composio preview rejects non-admins and bounded API keys before broker access", async () => {
  scopes = ["mcp:connect", "connections:read"];
  roles = ["user"];
  await expect(call("preview_composio_sync")).rejects.toThrow("admin required");
  roles = ["admin"];
  for (const field of ["projectId", "workspaceId", "organizationId"]) {
    keyBoundary = { [field]: "fixture-boundary" };
    await expect(call("preview_composio_sync")).rejects.toThrow("personal API key");
  }
  expect(managedReads).toBe(0);
});

function call(name: string, args: Record<string, unknown> = {}) {
  return post({
    request: new Request("https://fixture.invalid/mcp", {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    }),
  });
}

function listTools() {
  return post({
    request: new Request("https://fixture.invalid/mcp", {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      }),
    }),
  });
}

test("tool discovery exposes a stable titled platform catalog without duplicate resource tools", async () => {
  scopes = ["mcp:connect", "control:write"];
  const response = await listTools();
  const { result } = await response.json();
  expect(result.tools.length).toBeGreaterThan(0);
  expect(result.tools.every((tool: { title?: string }) => Boolean(tool.title))).toBe(true);
  expect(result.tools.some((tool: { name: string }) => tool.name.startsWith("resource_"))).toBe(
    false,
  );
  expect(
    result.tools.some((tool: { name: string }) => tool.name === "hubstaff_admin_request"),
  ).toBe(true);
});

test("approved resource invocation is an explicit tool error without an executor", async () => {
  const response = await call("resource_fixture_approved_tool", {
    action: "invoke",
  });
  const { result } = await response.json();
  expect(result.isError).toBe(true);
  expect(JSON.parse(result.content[0].text)).toMatchObject({
    status: "unsupported",
    code: "provider_executor_unavailable",
    operation: "invoke",
    execution: { verified: false, performed: false },
  });
  expect(tables).not.toContain("app_connections");
});

test("installation does not write a fabricated installed record", async () => {
  const response = await call("install_capability", {
    resource_id: resource.slug,
  });
  const { result } = await response.json();
  expect(result.isError).toBe(true);
  expect(JSON.parse(result.content[0].text)).toMatchObject({
    status: "unsupported",
    operation: "install",
  });
  expect(tables).not.toContain("capability_installations");
});

test("anonymous invocation remains rejected before catalog access", async () => {
  authenticated = false;
  expect((await call("resource_fixture_approved_tool", { action: "invoke" })).status).toBe(401);
  expect(tables).toEqual([]);
});

test("installation requires admin plus write scope", async () => {
  roles = ["member"];
  await expect(call("install_capability", { resource_id: resource.slug })).rejects.toThrow(
    "Admin role",
  );
  roles = ["admin"];
  scopes = ["mcp:connect"];
  await expect(call("install_capability", { resource_id: resource.slug })).rejects.toThrow(
    "control write scope",
  );
  expect(tables).not.toContain("capability_installations");
});

test("unverified catalog entries remain ineligible for installation", async () => {
  resource.verified = false;
  await expect(call("install_capability", { resource_id: resource.slug })).rejects.toThrow(
    "cannot be installed",
  );
  expect(tables).not.toContain("capability_installations");
});

test("read tokens discover write scope requirements without gaining execution rights", async () => {
  scopes = ["mcp:connect", "resources:read"];
  const response = await listTools();
  const { result } = await response.json();
  const tool = result.tools.find((item: { name: string }) => item.name === "call_connection_tool");
  expect(tool.securitySchemes).toEqual([{ type: "oauth2", scopes: ["connections:invoke"] }]);
  expect(tool._meta.securitySchemes).toEqual(tool.securitySchemes);
  const denied = await call("call_connection_tool", {});
  expect(denied.status).toBe(403);
  expect(tables).not.toContain("app_connections");
});

test("native Twilio writes require admin role and an invoke scope before provider execution", async () => {
  scopes = ["mcp:connect", "connections:invoke"];
  roles = ["developer"];
  const args = { connection_id: "fixture-connection", tool_name: "fixture-operation" };
  await expect(call("call_connection_tool", args)).rejects.toThrow("Admin role");
  expect(connectionCalls).toEqual([]);
  roles = ["admin"];
  scopes = ["mcp:connect", "connections:read"];
  expect((await call("call_connection_tool", args)).status).toBe(403);
  expect(connectionCalls).toEqual([]);
  roles = ["owner"];
  scopes = ["mcp:connect", "connections:invoke"];
  expect((await call("call_connection_tool", args)).status).toBe(200);
  expect(connectionCalls).toHaveLength(1);
});

test("Twilio read tools work for scoped non-admins without granting writes", async () => {
  scopes = ["mcp:connect", "connections:invoke"];
  roles = ["user"];
  connectionReadOnly = true;
  expect(
    (
      await call("call_connection_tool", {
        connection_id: "fixture-connection",
        tool_name: "fixture-operation",
      })
    ).status,
  ).toBe(200);
  expect(connectionCalls).toHaveLength(1);
});

test("adding Twilio execution preserves the project requirement for Custom MCP writes", async () => {
  scopes = ["mcp:connect", "connections:invoke"];
  connectionProvider = "custom_mcp";
  await expect(
    call("call_connection_tool", {
      connection_id: "fixture-connection",
      tool_name: "fixture-operation",
    }),
  ).rejects.toThrow("project-scoped");
  expect(connectionCalls).toEqual([]);
});

test("connection failures propagate as MCP tool errors instead of successful wrappers", async () => {
  connectionError = true;
  const response = await call("call_connection_tool", {
    connection_id: "fixture-connection",
    tool_name: "fixture-operation",
  });
  const { result } = await response.json();
  expect(result.isError).toBe(true);
});
