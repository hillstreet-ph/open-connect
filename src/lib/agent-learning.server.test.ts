import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { saveRunLearning } from "./agent-learning.server.ts";
function fixture(count = 3, fail = "") {
  const writes: Array<{
    table: string;
    data: Record<string, unknown>;
    options: Record<string, unknown>;
  }> = [];
  return {
    writes,
    db: {
      from(table: string) {
        const q = {
          upsert(data: Record<string, unknown>, options: Record<string, unknown>) {
            writes.push({ table, data, options });
            return q;
          },
          update() {
            return q;
          },
          select() {
            return q;
          },
          eq() {
            return q;
          },
          then(resolve: (value: unknown) => unknown) {
            return Promise.resolve({ error: table === fail ? {} : null, count }).then(resolve);
          },
        };
        return q;
      },
    } as unknown as SupabaseClient,
  };
}
const input = {
  userId: "owner",
  runId: "run",
  goal: "Test workflow",
  status: "succeeded" as const,
  summary: "token=secret Verified result",
  capabilitySlugs: ["github"],
  evidence: { token: "secret" },
  createDraft: true,
};
test("repeated procedures save owned redacted memory, knowledge, and an unpublished draft", async () => {
  const f = fixture();
  const r = await saveRunLearning(f.db, input);
  assert.equal(r.knowledge_promoted, true);
  assert.ok(r.studio_draft_id);
  assert.equal(r.published, false);
  assert.deepEqual(
    f.writes.map((w) => w.table),
    ["autonomous_run_events", "memory_records", "knowledge_items", "resources"],
  );
  const draft = f.writes[3]!;
  assert.equal(draft.data["owner_id"], "owner");
  assert.equal(draft.data["published"], false);
  assert.equal(draft.data["verified"], false);
  assert.ok(!JSON.stringify(f.writes).includes("token=secret"));
  assert.ok(f.writes.every((w) => w.options["ignoreDuplicates"] === true));
});
test("does not create drafts without resource scope or enough distinct successful runs", async () => {
  const f = fixture(2);
  assert.equal((await saveRunLearning(f.db, input)).knowledge_promoted, false);
  const g = fixture();
  assert.equal(
    (await saveRunLearning(g.db, { ...input, createDraft: false })).studio_draft_id,
    null,
  );
  assert.ok(!g.writes.some((w) => w.table === "resources"));
});
test("storage failures propagate and deterministic IDs make retries idempotent", async () => {
  const failed = fixture(3, "memory_records");
  await assert.rejects(saveRunLearning(failed.db, input), /memory could not/);
  const a = fixture(),
    b = fixture();
  await saveRunLearning(a.db, input);
  await saveRunLearning(b.db, input);
  assert.deepEqual(
    a.writes.map((w) => w.data["id"]),
    b.writes.map((w) => w.data["id"]),
  );
});
