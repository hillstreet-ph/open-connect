import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { exportOwnedContext } from "./data-controls.server.ts";
test("exports every owned page and never queries credential tables", async () => {
  const calls: Array<{ table: string; owner: string; offset: number }> = [];
  const db = {
    from(table: string) {
      let owner = "";
      const q = {
        select() {
          return q;
        },
        eq(_: string, value: string) {
          owner = value;
          return q;
        },
        order() {
          return q;
        },
        async range(offset: number) {
          calls.push({ table, owner, offset });
          return {
            error: null,
            data: offset === 0 ? Array.from({ length: 500 }, (_, id) => ({ id })) : [],
          };
        },
      };
      return q;
    },
  } as unknown as SupabaseClient;
  const result = await exportOwnedContext(db, "owner");
  assert.equal(result.memory.length, 500);
  assert.equal(result.knowledge.length, 500);
  assert.ok(calls.every((c) => c.owner === "owner"));
  assert.deepEqual([...new Set(calls.map((c) => c.table))].sort(), [
    "knowledge_items",
    "memory_records",
  ]);
});

test("helper capture is opt-in, retry-safe, redacted, and produces only private prompt drafts", async () => {
  const { captureHelperExchange } = await import("./data-controls.server.ts");
  const { defaultDataControls } = await import("./data-controls.ts");
  const writes: Array<{ table: string; value: Record<string, unknown>; options: unknown }> = [];
  const owners: string[] = [];
  const db = {
    from(table: string) {
      const q = {
        select() {
          return q;
        },
        eq(_field: string, owner: string) {
          owners.push(owner);
          return q;
        },
        contains() {
          return q;
        },
        gte() {
          return q;
        },
        order() {
          return q;
        },
        async limit() {
          return {
            error: null,
            data: ["a", "b", "c"].map((id) => ({
              id,
              metadata: {
                auto_capture: true,
                prompt_hash: (
                  writes[writes.length - 1]!.value["metadata"] as Record<string, unknown>
                )["prompt_hash"],
                prompt_summary: "Repeated goal",
              },
            })),
          };
        },
        async upsert(value: Record<string, unknown>, options: unknown) {
          writes.push({ table, value, options });
          return { error: null };
        },
      };
      return q;
    },
  } as unknown as SupabaseClient;
  await captureHelperExchange(db, "owner", "goal", "reply", defaultDataControls);
  assert.equal(writes.length, 0);
  const settings = { ...defaultDataControls, save_helper_memory: true };
  await captureHelperExchange(db, "owner", "password=hidden-value goal", "reply", settings);
  await captureHelperExchange(db, "owner", "password=hidden-value goal", "reply", settings);
  assert.equal(writes[0]!.value["id"], writes[1]!.value["id"]);
  assert.ok(!JSON.stringify(writes).includes("hidden-value"));
  assert.deepEqual(writes[0]!.options, { onConflict: "id", ignoreDuplicates: true });
  assert.ok(writes.every((w) => w.table === "memory_records"));
  await captureHelperExchange(db, "owner", "goal", "reply", { ...settings, suggest_drafts: true });
  const draft = writes.find((w) => w.table === "data_reuse_drafts")!;
  assert.equal(draft.value["user_id"], "owner");
  assert.equal(draft.value["resource_type"], "prompt");
  assert.match(String(draft.value["content"]), /unverified suggestion/);
  assert.ok(!("resource_id" in draft.value));
  assert.ok(owners.every((owner) => owner === "owner"));
});
