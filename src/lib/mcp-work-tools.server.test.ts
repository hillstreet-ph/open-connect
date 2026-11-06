import assert from "node:assert/strict";
import { test } from "node:test";
import { WORK_TOOL_SCOPES, WORK_TOOLS, isWorkTool, runWorkTool } from "./mcp-work-tools.server.ts";

type Call = { table: string; op: string; filters: Record<string, unknown>; payload?: unknown };

/** Minimal PostgREST-style fake that records filters so tests can assert isolation. */
function fakeDb(rows: Record<string, Record<string, unknown> | null> = {}) {
  const calls: Call[] = [];
  const db = {
    from(table: string) {
      const call: Call = { table, op: "select", filters: {} };
      calls.push(call);
      const chain: Record<string, unknown> = {
        select: () => chain,
        insert: (payload: unknown) => ((call.op = "insert"), (call.payload = payload), chain),
        update: (payload: unknown) => ((call.op = "update"), (call.payload = payload), chain),
        eq: (column: string, value: unknown) => ((call.filters[column] = value), chain),
        order: () => chain,
        limit: () => chain,
        single: async () => ({ data: rows[table] ?? { id: "new" }, error: null }),
        maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
        then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
      };
      return chain;
    },
  };
  return { db: db as never, calls };
}

const USER = "11111111-1111-4111-8111-111111111111";
const PROJECT = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const TASK = "44444444-4444-4444-8444-444444444444";
const noProject = async () => {};

test("every work tool is declared, scoped, and writes require control:write", () => {
  for (const tool of WORK_TOOLS) {
    assert.ok(isWorkTool(tool.name));
    const scope = WORK_TOOL_SCOPES[tool.name as keyof typeof WORK_TOOL_SCOPES];
    assert.equal(scope, tool.annotations.readOnlyHint ? "resources:read" : "control:write");
    assert.equal(tool.annotations.destructiveHint, false);
  }
  assert.equal(isWorkTool("delete_everything"), false);
});

test("reads are pinned to the key's user", async () => {
  const { db, calls } = fakeDb();
  for (const name of ["list_tasks", "list_schedules", "list_automations"] as const) {
    await runWorkTool(db, { userId: USER }, name, {}, noProject);
  }
  assert.ok(calls.every((c) => c.filters["user_id"] === USER));
});

test("project-scoped keys cannot reach another project", async () => {
  const { db, calls } = fakeDb();
  const key = { userId: USER, projectId: PROJECT };
  await assert.rejects(
    runWorkTool(db, key, "list_tasks", { project_id: OTHER }, noProject),
    /project scope/,
  );
  await assert.rejects(
    runWorkTool(db, key, "create_task", { title: "x", project_id: OTHER }, noProject),
    /project scope/,
  );
  await runWorkTool(db, key, "list_automations", {}, noProject);
  assert.equal(calls.at(-1)?.filters["project_id"], PROJECT);
});

test("create_task checks project access and inserts as the key's user", async () => {
  const { db, calls } = fakeDb();
  const checked: string[] = [];
  await runWorkTool(
    db,
    { userId: USER },
    "create_task",
    { title: "Ship", project_id: PROJECT },
    async (id) => {
      checked.push(id);
    },
  );
  assert.deepEqual(checked, [PROJECT]);
  const insert = calls.find((c) => c.op === "insert");
  assert.equal((insert?.payload as { user_id: string }).user_id, USER);
  assert.equal((insert?.payload as { status: string }).status, "todo");
});

test("create_task surfaces a denied project", async () => {
  const { db } = fakeDb();
  await assert.rejects(
    runWorkTool(
      db,
      { userId: USER },
      "create_task",
      { title: "x", project_id: PROJECT },
      async () => {
        throw new Error("Project is unavailable to this API key.");
      },
    ),
    /unavailable/,
  );
});

test("input validation rejects bad status and missing title", async () => {
  const { db } = fakeDb();
  await assert.rejects(
    runWorkTool(db, { userId: USER }, "list_tasks", { status: "deleted" }, noProject),
  );
  await assert.rejects(runWorkTool(db, { userId: USER }, "create_task", {}, noProject));
  await assert.rejects(
    runWorkTool(
      db,
      { userId: USER },
      "update_task_status",
      { id: TASK, status: "purged" },
      noProject,
    ),
  );
});

test("project keys cannot update tasks outside their project", async () => {
  const { db } = fakeDb({ tasks: { project_id: OTHER } });
  await assert.rejects(
    runWorkTool(
      db,
      { userId: USER, projectId: PROJECT },
      "update_task_status",
      { id: TASK, status: "done" },
      noProject,
    ),
    /project scope/,
  );
});

test("set_automation_enabled reports a missing automation", async () => {
  const { db } = fakeDb();
  await assert.rejects(
    runWorkTool(
      db,
      { userId: USER },
      "set_automation_enabled",
      { id: TASK, enabled: false },
      noProject,
    ),
    /not found/,
  );
});
