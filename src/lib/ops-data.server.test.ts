import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { loadOwnedTasks } from "./ops-data.server.ts";

test("task REST request works without a project FK and retains owner/filter boundaries", async () => {
  let requestUrl: URL | undefined;
  const db = createClient("https://example.supabase.co", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input) => {
        requestUrl = new URL(String(input));
        return new Response(
          JSON.stringify([{ id: "task-1", title: "Review release", project_id: null }]),
          { headers: { "content-type": "application/json" } },
        );
      },
    },
  });
  const tasks = await loadOwnedTasks(db, "owner-1", { status: "todo" });
  assert.equal(tasks[0]?.title, "Review release");
  assert.equal(requestUrl?.searchParams.get("user_id"), "eq.owner-1");
  assert.equal(requestUrl?.searchParams.get("status"), "eq.todo");
  assert.equal(requestUrl?.searchParams.get("limit"), "100");
  assert.equal(requestUrl?.searchParams.get("select")?.includes("("), false);
  assert.equal(requestUrl?.searchParams.get("select")?.includes("updated_at"), true);
});

test("task moves save one owned record and reject a stale version", async () => {
  const { updateOwnedTaskStatus } = await import("./ops-data.server.ts");
  let requestUrl: URL | undefined;
  let requestBody: Record<string, unknown> = {};
  let stale = false;
  const db = createClient("https://example.supabase.co", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        requestUrl = new URL(String(input));
        requestBody = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify(
            stale ? [] : [{ id: "task-1", status: "done", updated_at: "2026-10-26T02:00:00Z" }],
          ),
          { headers: { "content-type": "application/json" } },
        );
      },
    },
  });
  const input = { id: "task-1", status: "done", expectedUpdatedAt: "2026-10-26T01:00:00Z" };
  const moved = await updateOwnedTaskStatus(db, "owner-1", input);
  assert.equal(moved.status, "done");
  assert.equal(requestUrl?.searchParams.get("user_id"), "eq.owner-1");
  assert.equal(requestUrl?.searchParams.get("id"), "eq.task-1");
  assert.equal(requestUrl?.searchParams.get("updated_at"), "eq." + input.expectedUpdatedAt);
  assert.equal(requestBody["status"], "done");
  assert.equal(requestBody["user_id"], undefined);
  stale = true;
  await assert.rejects(updateOwnedTaskStatus(db, "owner-1", input), /Task changed/);
});

test("column queries keep old pending work accessible beside a full completed column", async () => {
  const statuses: string[] = [];
  const db = createClient("https://example.supabase.co", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input) => {
        const status = new URL(String(input)).searchParams.get("status");
        statuses.push(status ?? "");
        const rows =
          status === "eq.done"
            ? Array.from({ length: 100 }, (_, i) => ({ id: `done-${i}`, status: "done" }))
            : status === "eq.todo"
              ? [{ id: "older-pending", status: "todo" }]
              : [];
        return new Response(JSON.stringify(rows), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  });
  const { TASK_STATUSES } = await import("./operations.ts");
  const results = await Promise.all(
    TASK_STATUSES.map((status) => loadOwnedTasks(db, "owner", { status })),
  );
  assert.equal(results[0]?.[0]?.id, "older-pending");
  assert.equal(results[3]?.length, 100);
  assert.equal(new Set(statuses).size, 5);
});
