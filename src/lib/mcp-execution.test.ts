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
const privateReads: { table: string; filters: Record<string, unknown> }[] = [];
const autoPreferences = new Map<string, boolean>();
let connectionProvider = "twilio";
let connectionReadOnly = false;
let connectionError = false;
const connectionCalls: unknown[] = [];
const connectionUpdates: Array<{
  values: Record<string, unknown>;
  filters: Record<string, unknown>;
}> = [];
let connectionToolReads = 0;
let hubstaffRequests = 0;
const assignedConnections = new Set<string>();
const assignedConnection = {
  id: "fixture-connection",
  provider: "twilio",
  display_name: "Project account",
  status: "connected",
  scopes: ["account:read"],
};

mock.module("@/lib/managed-connectors.server", () => ({
  listOwnedManagedConnections: async (userId: string) => {
    expect(userId).toBe("fixture-user");
    managedReads++;
    return [{ id: "ca_fixture", provider: "gmail" }];
  },
  listComposioToolkits: async () => [{ slug: "gmail", name: "Gmail" }],
}));

mock.module("@/lib/custom-mcp.server", () => ({
  listCustomMcpTools: async () => {
    connectionToolReads++;
    return {
      connection: { id: "fixture-connection", provider: connectionProvider },
      tools: [{ name: "fixture-operation", annotations: { readOnlyHint: connectionReadOnly } }],
    };
  },
  callCustomMcpTool: async (...args: unknown[]) => {
    connectionCalls.push(args);
    return { content: [{ type: "text", text: "{}" }], isError: connectionError };
  },
}));

mock.module("@/lib/hubstaff-admin.server", () => ({
  hubstaffAdminConfig: () => ({ configured: true }),
  hubstaffAdminIdentity: async () => ({ id: "fixture-hubstaff-user" }),
  listHubstaffOrganizations: async () => [],
  hubstaffAdminRequest: async () => {
    hubstaffRequests++;
    return { ok: true };
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
      if (table === "auto_preferences") {
        const filters: Record<string, unknown> = {};
        let write: Record<string, unknown> | null = null;
        const query = {
          select() {
            return this;
          },
          eq(k: string, v: unknown) {
            filters[k] = v;
            return this;
          },
          upsert(row: Record<string, unknown>) {
            write = row;
            return this;
          },
          async maybeSingle() {
            const enabled = autoPreferences.get(
              String(filters["user_id"]) + "/" + String(filters["scope_key"]),
            );
            return { data: enabled === undefined ? null : { enabled }, error: null };
          },
          async single() {
            if (!write) throw new Error("write missing");
            expect(write["user_id"]).toBe("fixture-user");
            autoPreferences.set(
              String(write["user_id"]) + "/" + String(write["scope_key"]),
              Boolean(write["enabled"]),
            );
            return { data: { enabled: write["enabled"] }, error: null };
          },
        };
        return query;
      }
      if (
        ["organization_members", "projects", "project_members", "project_connections"].includes(
          table,
        )
      ) {
        const filters: Record<string, unknown> = {};
        const query = {
          select() {
            return this;
          },
          eq(field: string, value: unknown) {
            filters[field] = value;
            return this;
          },
          in() {
            return this;
          },
          maybeSingle: async () => ({
            data:
              table === "projects"
                ? {
                    id: "fixture-project",
                    organization_id: "fixture-org",
                    workspace_id: "fixture-workspace",
                  }
                : table === "organization_members"
                  ? { id: "fixture-membership" }
                  : table === "project_connections" &&
                      filters["project_id"] === "fixture-project" &&
                      assignedConnections.has(String(filters["connection_id"]))
                    ? { id: "fixture-grant" }
                    : null,
            error: null,
          }),
          then(
            onfulfilled: (value: { data: unknown[]; error: null }) => unknown,
            onrejected?: (reason: unknown) => unknown,
          ) {
            const data =
              table === "organization_members"
                ? [{ organization_id: "fixture-org" }]
                : filters["project_id"] === "fixture-project" &&
                    assignedConnections.has(assignedConnection.id)
                  ? [{ connection_id: assignedConnection.id, app_connections: assignedConnection }]
                  : [];
            return Promise.resolve({ data, error: null }).then(onfulfilled, onrejected);
          },
        };
        return query;
      }
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
      if (table === "memory_records" || table === "knowledge_items") {
        const filters: Record<string, unknown> = {};
        const query = {
          select() {
            return this;
          },
          eq(field: string, value: unknown) {
            filters[field] = value;
            return this;
          },
          order() {
            return this;
          },
          limit() {
            return this;
          },
          is(field: string, value: unknown) {
            filters[field] = value;
            return this;
          },
          neq() {
            return this;
          },
          then(
            onfulfilled: (value: { data: unknown[]; error: null }) => unknown,
            onrejected?: (reason: unknown) => unknown,
          ) {
            privateReads.push({ table, filters: { ...filters } });
            return Promise.resolve({
              data: [{ id: filters["project_id"] ? "project-row" : "personal-row" }],
              error: null,
            }).then(onfulfilled, onrejected);
          },
        };
        return query;
      }
      if (table === "app_connections") {
        const filters: Record<string, unknown> = {};
        let values: Record<string, unknown> | undefined;
        const query = {
          select() {
            return this;
          },
          eq(field: string, value: unknown) {
            filters[field] = value;
            return this;
          },
          order() {
            return this;
          },
          range: async () => ({ data: [], error: null }),
          maybeSingle: async () => ({
            data: { id: "fixture-connection", metadata: { source: "fixture" } },
            error: null,
          }),
          update(value: Record<string, unknown>) {
            values = value;
            return this;
          },
          single: async () => {
            if (values) connectionUpdates.push({ values, filters });
            return { data: { id: "fixture-connection", provider: "telegram" }, error: null };
          },
        };
        return query;
      }
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
  autoPreferences.clear();
  authenticated = true;
  roles = ["admin"];
  scopes = ["mcp:connect", "control:write"];
  tables.length = 0;
  privateReads.length = 0;
  resource.verified = true;
  connectionProvider = "twilio";
  connectionReadOnly = false;
  connectionError = false;
  connectionCalls.length = 0;
  connectionUpdates.length = 0;
  managedReads = 0;
  keyBoundary = {};
  assignedConnections.clear();
  connectionToolReads = 0;
  hubstaffRequests = 0;
});

test("project runtime private reads never query owner personal memory or knowledge", async () => {
  keyBoundary = {
    projectId: "fixture-project",
    organizationId: "fixture-org",
    workspaceId: "fixture-workspace",
  };
  for (const [scope, tool] of [
    ["memory:read", "list_my_memory"],
    ["knowledge:read", "list_my_knowledge"],
  ] as const) {
    scopes = [scope];
    privateReads.length = 0;
    const payload = JSON.parse((await (await call(tool)).json()).result.content[0].text);
    expect(payload.personal).toEqual([]);
    expect(payload.project).toEqual([{ id: "project-row" }]);
    expect(privateReads).toHaveLength(1);
    expect(privateReads[0]!.filters).toEqual({
      user_id: "fixture-user",
      project_id: "fixture-project",
    });
    await expect(call(tool, { project_id: "another-project" })).rejects.toThrow(
      "different project",
    );
    expect(privateReads).toHaveLength(1);
  }
});

test("unbound owner private reads retain personal and explicitly authorized project records", async () => {
  for (const [scope, tool] of [
    ["memory:read", "list_my_memory"],
    ["knowledge:read", "list_my_knowledge"],
  ] as const) {
    scopes = [scope];
    privateReads.length = 0;
    const payload = JSON.parse(
      (await (await call(tool, { project_id: "fixture-project" })).json()).result.content[0].text,
    );
    expect(payload.personal).toEqual([{ id: "personal-row" }]);
    expect(payload.project).toEqual([{ id: "project-row" }]);
    expect(privateReads).toHaveLength(2);
    expect(privateReads.every((read) => read.filters["user_id"] === "fixture-user")).toBe(true);
  }
});

test("project connection catalogs contain only assigned accounts", async () => {
  keyBoundary = {
    projectId: "fixture-project",
    organizationId: "fixture-org",
    workspaceId: "fixture-workspace",
  };
  scopes = ["mcp:connect", "connections:read"];
  for (const tool of ["list_connections", "inspect_connections"]) {
    const empty = await (await call(tool)).json();
    const catalog = JSON.parse(empty.result.content[0].text);
    expect(catalog.data ?? catalog.connections).toEqual([]);
  }
  assignedConnections.add(assignedConnection.id);
  for (const tool of ["list_connections", "inspect_connections"]) {
    const response = await (await call(tool)).json();
    const catalog = JSON.parse(response.result.content[0].text);
    expect(catalog.data ?? catalog.connections).toHaveLength(1);
    expect((catalog.data ?? catalog.connections)[0].id).toBe(assignedConnection.id);
  }
});

test("project tool discovery denies unassigned owner accounts before broker access", async () => {
  keyBoundary = { projectId: "fixture-project" };
  scopes = ["mcp:connect", "connections:read"];
  const args = { connection_id: assignedConnection.id };
  await expect(call("list_connection_tools", args)).rejects.toThrow("not assigned");
  expect(connectionToolReads).toBe(0);
  assignedConnections.add(assignedConnection.id);
  expect((await call("list_connection_tools", args)).status).toBe(200);
  expect(connectionToolReads).toBe(1);
});

test("project execution denies unassigned owner accounts before broker access", async () => {
  keyBoundary = { projectId: "fixture-project" };
  scopes = ["mcp:connect", "connections:invoke"];
  connectionReadOnly = true;
  const args = { connection_id: assignedConnection.id, tool_name: "fixture-operation" };
  await expect(call("call_connection_tool", args)).rejects.toThrow("not assigned");
  expect(connectionToolReads).toBe(0);
  expect(connectionCalls).toEqual([]);
  assignedConnections.add(assignedConnection.id);
  expect((await call("call_connection_tool", args)).status).toBe(200);
  expect(connectionCalls).toHaveLength(1);
});

test("control decisions reject non-admins and bounded keys before approval writes", async () => {
  const args = {
    approval_id: "00000000-0000-4000-8000-000000000001",
    decision: "approved",
    confirm: true,
  };
  scopes = ["mcp:connect", "tools:invoke"];
  roles = ["developer"];
  await expect(call("decide_control_approval", args)).rejects.toThrow("Admin role");
  expect(tables).not.toContain("control_approvals");
  roles = ["admin"];
  await expect(call("decide_control_approval", args)).rejects.toThrow("control write scope");
  expect(tables).not.toContain("control_approvals");
  scopes = ["mcp:connect", "control:write"];
  for (const boundary of [
    { projectId: "project" },
    { workspaceId: "workspace" },
    { organizationId: "org" },
  ]) {
    keyBoundary = boundary;
    await expect(call("decide_control_approval", args)).rejects.toThrow("personal API key");
    expect(tables).not.toContain("control_approvals");
  }
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

test("private read grants pass the MCP entry gate without mcp:connect", async () => {
  for (const [scope, tool, table] of [
    ["memory:read", "list_my_memory", "memory_records"],
    ["knowledge:read", "list_my_knowledge", "knowledge_items"],
  ] as const) {
    scopes = [scope];
    const response = await call(tool);
    expect(response.status).toBe(200);
    const { result } = await response.json();
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      personal: [{ id: "personal-row" }],
      project: [],
      user_owned_only: true,
    });
    expect(tables).toContain(table);
  }
});

test("private read grants cannot invoke Hubstaff admin requests", async () => {
  for (const scope of ["memory:read", "knowledge:read"]) {
    scopes = [scope];
    const response = await call("hubstaff_admin_request", {
      method: "GET",
      path: "/v2/organizations",
    });
    expect(response.status).toBe(403);
  }
  expect(hubstaffRequests).toBe(0);
});

test("Hubstaff GET requests require and accept the advertised tools invoke scope", async () => {
  scopes = ["tools:invoke"];
  const response = await call("hubstaff_admin_request", {
    method: "GET",
    path: "/v2/organizations",
  });
  expect(response.status).toBe(200);
  expect(hubstaffRequests).toBe(1);
});

test("Hubstaff writes preserve the existing connections invoke control gate", async () => {
  scopes = ["mcp:connect", "connections:invoke"];
  const response = await call("hubstaff_admin_request", {
    method: "PATCH",
    path: "/v2/organizations/1",
    body: { name: "Fixture" },
  });
  expect(response.status).toBe(200);
  expect(hubstaffRequests).toBe(1);
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

test("native Telegram sends require admin and provider invoke grants before execution", async () => {
  connectionProvider = "telegram";
  scopes = ["mcp:connect", "connections:invoke"];
  roles = ["user"];
  const args = { connection_id: "fixture-connection", tool_name: "fixture-operation" };
  await expect(call("call_connection_tool", args)).rejects.toThrow("Admin role");
  expect(connectionCalls).toEqual([]);
  roles = ["admin"];
  scopes = ["mcp:connect", "connections:read"];
  expect((await call("call_connection_tool", args)).status).toBe(403);
  expect(connectionCalls).toEqual([]);
  scopes = ["mcp:connect", "connections:invoke"];
  expect((await call("call_connection_tool", args)).status).toBe(200);
  expect(connectionCalls).toHaveLength(1);
});

test("Telegram destination configuration preserves metadata and updates only the owned bot", async () => {
  const credentialRef = `credential://telegram/${"a".repeat(8)}-aaaa-aaaa-aaaa-${"a".repeat(12)}`;
  const response = await call("configure_connection", {
    provider: "telegram",
    credential_ref: credentialRef,
    scopes: ["inbound:telegram", "messages:send"],
    telegram_destination: { chat_id: "-1001234567890", message_thread_id: 167 },
  });
  expect(response.status).toBe(200);
  expect(connectionUpdates).toHaveLength(1);
  expect(connectionUpdates[0]!.values["metadata"]).toEqual({
    source: "fixture",
    telegram_chat_id: "-1001234567890",
    telegram_message_thread_id: 167,
  });
  expect(connectionUpdates[0]!.filters["user_id"]).toBe("fixture-user");
  expect(connectionUpdates[0]!.filters["id"]).toBe("fixture-connection");
});

test("Telegram destination configuration rejects missing control access and invalid bindings before writes", async () => {
  const args = {
    provider: "telegram",
    credential_ref: `credential://telegram/${"a".repeat(8)}-aaaa-aaaa-aaaa-${"a".repeat(12)}`,
    telegram_destination: { chat_id: "-1001234567890", message_thread_id: 167 },
  };
  roles = ["user"];
  await expect(call("configure_connection", args)).rejects.toThrow("Admin role");
  roles = ["admin"];
  scopes = ["mcp:connect", "connections:invoke"];
  await expect(call("configure_connection", args)).rejects.toThrow("control write");
  scopes = ["mcp:connect", "control:write"];
  await expect(call("configure_connection", { ...args, provider: "twilio" })).rejects.toThrow(
    "Telegram provider",
  );
  await expect(
    call("configure_connection", {
      ...args,
      credential_ref: args.credential_ref.replace("telegram", "github"),
    }),
  ).rejects.toThrow("bot credential");
  await expect(
    call("configure_connection", {
      ...args,
      telegram_destination: { chat_id: "@other", message_thread_id: 167 },
    }),
  ).rejects.toThrow("supergroup");
  expect(connectionUpdates).toEqual([]);
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

test("Auto toggle enforces write scope and saves only the authenticated key context", async () => {
  scopes = ["mcp:connect", "resources:read"];
  expect((await call("set_auto_mode", { enabled: false })).status).toBe(403);
  expect(autoPreferences.size).toBe(0);
  scopes.push("tools:invoke");
  keyBoundary = { projectId: "fixture-project" };
  const { result } = await (
    await call("set_auto_mode", { enabled: false, user_id: "other-user", scope_key: "personal" })
  ).json();
  expect(result.structuredContent.auto.scope).toBe("project:fixture-project");
  expect(autoPreferences.get("fixture-user/project:fixture-project")).toBe(false);
  expect(autoPreferences.has("other-user/personal")).toBe(false);
});

test("Auto discovery respects Off and returns metadata without provider execution", async () => {
  scopes = ["mcp:connect", "resources:read", "tools:invoke"];
  await call("set_auto_mode", { enabled: false });
  let payload = (await (await call("auto_discover", { goal: "Approved fixture" })).json()).result
    .structuredContent;
  expect(payload.status).toBe("disabled");
  expect(payload.matches).toEqual([]);
  await call("set_auto_mode", { enabled: true });
  payload = (await (await call("auto_discover", { goal: "Approved fixture" })).json()).result
    .structuredContent;
  expect(payload.status).toBe("matched");
  expect(payload.matches[0].slug).toBe(resource.slug);
  expect(payload.execution_performed).toBe(false);
  expect(payload.values_exposed).toBe(false);
  expect(connectionCalls).toEqual([]);
  expect(connectionToolReads).toBe(0);
});
