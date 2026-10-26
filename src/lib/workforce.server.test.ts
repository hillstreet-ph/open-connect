import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadWorkforceChat, workforceReferences } from "./workforce.server.ts";
import { executeWorkforceTool } from "./workforce-execution.server.ts";
import { WORKFORCE_TEMPLATES } from "./workforce.templates.ts";

function fixture(rows: Record<string, Record<string, unknown>[]>, shared: unknown[] = []) {
  const calls: { table: string; filters: Record<string, unknown> }[] = [];
  const db = {
    rpc: async (name: string) => {
      assert.equal(name, "list_project_connections");
      return { data: shared, error: null };
    },
    from(table: string) {
      const filters: Record<string, unknown> = {};
      calls.push({ table, filters });
      const result = () => ({
        data: (rows[table] ?? []).filter((r) =>
          Object.entries(filters).every(([k, v]) =>
            Array.isArray(v) ? v.includes(r[k]) : r[k] === v,
          ),
        ),
        error: null,
      });
      const q = {
        select() {
          return q;
        },
        limit() {
          return q;
        },
        neq() {
          return q;
        },
        eq(k: string, v: unknown) {
          filters[k] = v;
          return q;
        },
        is(k: string, v: unknown) {
          filters[k] = v;
          return q;
        },
        in(k: string, v: unknown[]) {
          filters[k] = v;
          return q;
        },
        maybeSingle: async () => ({ data: result().data[0] ?? null, error: null }),
        then(resolve: (r: ReturnType<typeof result>) => void) {
          resolve(result());
        },
      };
      return q;
    },
  } as unknown as SupabaseClient;
  return { db, calls };
}
const config = WORKFORCE_TEMPLATES[0]!.config;
test("chat execution loads the pinned revision, never another user's chat or a disabled agent", async () => {
  const { db } = fixture({
    agent_chats: [
      { id: "chat", user_id: "owner", workforce_agent_id: "agent", workforce_version_id: "v1" },
    ],
    workforce_agents: [{ id: "agent", enabled: true, project_id: null, active_version_id: "v2" }],
    workforce_agent_versions: [{ id: "v1", agent_id: "agent", number: 1, config }],
  });
  assert.equal((await loadWorkforceChat(db, "owner", "chat")).version.id, "v1");
  await assert.rejects(loadWorkforceChat(db, "other", "chat"), /unavailable/);
  const disabled = fixture({
    agent_chats: [
      { id: "chat", user_id: "owner", workforce_agent_id: "agent", workforce_version_id: "v1" },
    ],
    workforce_agents: [{ id: "agent", enabled: false, project_id: null }],
    workforce_agent_versions: [{ id: "v1", agent_id: "agent", config }],
  });
  await assert.rejects(loadWorkforceChat(disabled.db, "owner", "chat"), /disabled/);
  assert.equal((await loadWorkforceChat(disabled.db, "owner", "chat", true)).version.id, "v1");
});
test("project app references use only the existing explicit-grant metadata RPC", async () => {
  const id = "10000000-0000-4000-8000-000000000001";
  const { db, calls } = fixture({}, [
    { connection_id: id, app_connections: { id, display_name: "Shared", status: "connected" } },
  ]);
  const result = await workforceReferences(
    db,
    { ...config, connectionIds: [id] },
    "project",
    "member",
  );
  assert.equal(result.connections[0]?.display_name, "Shared");
  assert.equal(calls.length, 0, "Shared credentials and personal rows are never queried");
  await assert.rejects(
    workforceReferences(fixture({}).db, { ...config, connectionIds: [id] }, "project", "member"),
    /not shared/,
  );
});
test("project specialist tools cannot widen project scope or call ungranted capabilities", async () => {
  const { db, calls } = fixture({
    tasks: [
      { id: "a", project_id: "project" },
      { id: "b", project_id: "other" },
    ],
  });
  const specialist = {
    agent: { project_id: "project" },
    version: { config: { ...config, tools: ["list_tasks", "search_saved_context"] } },
    references: { knowledge: [{ id: "selected", title: "Allowed", content: "Bounded evidence" }] },
  } as unknown as Awaited<ReturnType<typeof loadWorkforceChat>>;
  let executed = 0;
  const fallback = async () => {
    executed++;
    return {};
  };
  assert.deepEqual(await executeWorkforceTool(db, specialist, "list_tasks", {}, fallback), {
    tasks: [{ id: "a", project_id: "project" }],
  });
  assert.equal(calls[0]?.filters["project_id"], "project");
  await assert.rejects(
    executeWorkforceTool(db, specialist, "create_task", {}, fallback),
    /not granted/,
  );
  await assert.rejects(
    executeWorkforceTool(db, specialist, "list_tasks", { projectId: "other" }, fallback),
    /mismatch/,
  );
  const result = await executeWorkforceTool(
    db,
    specialist,
    "search_saved_context",
    { query: "evidence" },
    fallback,
  );
  assert.deepEqual(result["records"], specialist.references.knowledge);
  assert.equal(executed, 0);
});

test("schedule references and task updates stay inside the specialist's project", async () => {
  const { db } = fixture({
    automations: [
      { id: "other-auto", project_id: "other" },
      { id: "allowed", project_id: "project" },
    ],
  });
  const specialist = {
    agent: { project_id: "project" },
    version: { config: { ...config, tools: ["create_schedule"] } },
    references: { knowledge: [] },
  } as unknown as Awaited<ReturnType<typeof loadWorkforceChat>>;
  let executed = 0;
  const fallback = async (_: string, args: Record<string, unknown>) => {
    executed++;
    assert.equal(args["projectId"], "project");
    return { saved: true };
  };
  await assert.rejects(
    executeWorkforceTool(
      db,
      specialist,
      "create_schedule",
      { automationId: "other-auto" },
      fallback,
    ),
    /outside/,
  );
  assert.equal(executed, 0);
  await executeWorkforceTool(
    db,
    specialist,
    "create_schedule",
    { automationId: "allowed" },
    fallback,
  );
  assert.equal(executed, 1);
});
