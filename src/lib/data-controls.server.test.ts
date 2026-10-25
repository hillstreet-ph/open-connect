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
