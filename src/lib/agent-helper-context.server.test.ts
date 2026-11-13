import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { searchHelperContext } from "./agent-helper-context.server.ts";

function database(fail = false) {
  const calls: unknown[][] = [];
  const db = {
    from(table: string) {
      const chain = new Proxy(
        {},
        {
          get(_, method) {
            if (method === "then")
              return (resolve: (value: unknown) => void) =>
                resolve({
                  error: fail ? { message: "private database diagnostic" } : null,
                  data: [
                    {
                      id: table,
                      title: "Saved note",
                      content: "password=private-value " + "a".repeat(2000),
                      source_url: "https://example.test/?token=private",
                    },
                  ],
                });
            return (...args: unknown[]) => {
              calls.push([table, method, ...args]);
              return chain;
            };
          },
        },
      );
      return chain;
    },
  } as unknown as SupabaseClient;
  return { db, calls };
}

test("personal context enforces ownership, personal scope, expiry, archive and result bounds", async () => {
  const { db, calls } = database();
  const result = await searchHelperContext(db, "owner", "saved", null);
  for (const table of ["memory_records", "knowledge_items"]) {
    assert.ok(
      calls.some((c) => c[0] === table && c[1] === "eq" && c[2] === "user_id" && c[3] === "owner"),
    );
    assert.ok(
      calls.some((c) => c[0] === table && c[1] === "is" && c[2] === "project_id" && c[3] === null),
    );
    assert.ok(calls.some((c) => c[0] === table && c[1] === "limit" && c[2] === 8));
  }
  assert.ok(
    calls.some(
      (c) => c[1] === "or" && String(c[2]).startsWith("expires_at.is.null,expires_at.gt."),
    ),
  );
  assert.ok(calls.some((c) => c[1] === "neq" && c[2] === "status" && c[3] === "archived"));
  assert.doesNotMatch(JSON.stringify(result), /private-value|token=private/);
  assert.ok(
    (result["records"] as Array<{ content: string }>).every((row) => row.content.length <= 1200),
  );
});

test("project search never falls back to personal or another owner's records", async () => {
  const { db, calls } = database();
  await searchHelperContext(db, "owner", "100%_", "project");
  assert.equal(
    calls.filter((c) => c[1] === "eq" && c[2] === "project_id" && c[3] === "project").length,
    2,
  );
  assert.equal(calls.filter((c) => c[1] === "is").length, 0);
  assert.ok(calls.some((c) => c[1] === "ilike" && c[3] === "%100\\%\\_%"));
});

test("context lookup fails closed without exposing database diagnostics", async () => {
  const { db } = database(true);
  await assert.rejects(
    searchHelperContext(db, "owner", "saved", null),
    /^Error: Saved context search is unavailable\.$/,
  );
});
