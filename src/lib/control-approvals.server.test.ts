import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decideControlApproval } from "./control-approvals.server.ts";

const id = "00000000-0000-4000-8000-000000000001";
function fixture(overrides: Record<string, unknown> = {}) {
  const row: Record<string, unknown> = {
    id,
    tenant_id: "user",
    requested_by: "user",
    state: "pending",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    action: "execute_plan",
    ...overrides,
  };
  let reads = 0;
  const db = {
    from(table: string) {
      reads++;
      assert.equal(table, "control_approvals");
      return {
        update(values: Record<string, unknown>) {
          const filters: Array<(row: Record<string, unknown>) => boolean> = [];
          const query = {
            eq(column: string, value: unknown) {
              filters.push((r) => r[column] === value);
              return query;
            },
            gt(column: string, value: string) {
              filters.push((r) => String(r[column]) > value);
              return query;
            },
            select() {
              return query;
            },
            async maybeSingle() {
              if (!filters.every((filter) => filter(row))) return { data: null, error: null };
              Object.assign(row, values);
              return { data: { ...row }, error: null };
            },
          };
          return query;
        },
      };
    },
  } as unknown as SupabaseClient;
  return { db, row, reads: () => reads };
}

test("decisions require explicit confirmation before database access", async () => {
  const f = fixture();
  await assert.rejects(decideControlApproval(f.db, "user", id, "approved", false), /confirm=true/);
  assert.equal(f.reads(), 0);
});

test("foreign, expired and replayed approval requests cannot be approved", async () => {
  for (const overrides of [
    { requested_by: "other" },
    { tenant_id: "other" },
    { expires_at: new Date(Date.now() - 1).toISOString() },
    { state: "approved" },
  ]) {
    const f = fixture(overrides);
    await assert.rejects(decideControlApproval(f.db, "user", id, "approved", true), /unavailable/);
    assert.equal(f.row["decided_by"], undefined);
  }
});

test("a live decision records the caller once and never claims execution", async () => {
  const f = fixture();
  const result = await decideControlApproval(f.db, "user", id, "approved", true);
  assert.equal(result.state, "approved");
  assert.equal(result.execution_started, false);
  assert.equal(f.row["decided_by"], "user");
  await assert.rejects(decideControlApproval(f.db, "user", id, "denied", true), /already decided/);
});
