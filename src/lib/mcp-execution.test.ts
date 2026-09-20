import { beforeEach, expect, mock, test } from "bun:test";

let post: (args: { request: Request }) => Promise<Response>;
let authenticated = true;
let roles = ["owner"];
let scopes = ["mcp:connect", "control:write"];
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

mock.module("@tanstack/react-router", () => ({
  createFileRoute: () => (options: { server: { handlers: { POST: typeof post } } }) => {
    post = options.server.handlers.POST;
    return options;
  },
}));
mock.module("@/lib/gateway.server", () => ({
  authenticateKey: async () => (authenticated ? { userId: "fixture-user", scopes } : null),
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
            eq: () => ({ order: () => ({ limit: async () => ({ data: [resource] }) }) }),
          }),
        };
      if (table === "user_roles")
        return {
          select: () => ({ eq: async () => ({ data: roles.map((role) => ({ role })) }) }),
        };
      throw new Error(`Unexpected database access: ${table}`);
    },
  },
}));
await import("../routes/mcp");

beforeEach(() => {
  authenticated = true;
  roles = ["owner"];
  scopes = ["mcp:connect", "control:write"];
  tables.length = 0;
  resource.verified = true;
});

function call(name: string, args: Record<string, unknown> = {}) {
  return post({
    request: new Request("https://fixture.invalid/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    }),
  });
}

test("approved resource invocation is an explicit tool error without an executor", async () => {
  const response = await call("resource_fixture_approved_tool", { action: "invoke" });
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
  const response = await call("install_capability", { resource_id: resource.slug });
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

test("installation still requires owner or admin plus write scope", async () => {
  roles = ["member"];
  await expect(call("install_capability", { resource_id: resource.slug })).rejects.toThrow(
    "Owner/admin role",
  );
  roles = ["owner"];
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
