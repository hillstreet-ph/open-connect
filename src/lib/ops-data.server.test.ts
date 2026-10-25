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
