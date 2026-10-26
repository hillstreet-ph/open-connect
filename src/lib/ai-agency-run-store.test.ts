import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { finishAgencyProposalRun } from "./ai-agency-run-store.server.ts";

for (const state of ["succeeded", "failed"] as const) {
  test(`Agency ${state} finalization is conditional on owner, executor and running state`, async () => {
    let request: URL | undefined;
    let body: Record<string, unknown> = {};
    const db = createClient("https://example.supabase.co", "synthetic-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (input, init) => {
          request = new URL(String(input));
          body = JSON.parse(String(init?.body));
          return new Response(JSON.stringify([{ id: "run-1" }]), {
            headers: { "content-type": "application/json" },
          });
        },
      },
    });
    await finishAgencyProposalRun(db, "owner-1", "run-1", state, {
      workers: [],
      executor: "untrusted",
      execution_performed: true,
    });
    assert.equal(request?.searchParams.get("id"), "eq.run-1");
    assert.equal(request?.searchParams.get("user_id"), "eq.owner-1");
    assert.equal(request?.searchParams.get("state"), "eq.running");
    assert.equal(request?.searchParams.get("evidence"), 'cs.{"executor":"ai_agency"}');
    assert.equal(body["state"], state);
    assert.deepEqual(body["evidence"], {
      workers: [],
      executor: "ai_agency",
      execution_performed: false,
    });
  });
}

for (const scenario of ["no matching run", "database error"] as const) {
  test(`Agency rejects unverified completion: ${scenario}`, async () => {
    const db = createClient("https://example.supabase.co", "synthetic-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async () =>
          new Response(
            scenario === "database error"
              ? JSON.stringify({ message: "sensitive internal detail" })
              : "[]",
            {
              status: scenario === "database error" ? 500 : 200,
              headers: { "content-type": "application/json" },
            },
          ),
      },
    });
    await assert.rejects(
      finishAgencyProposalRun(db, "owner-1", "run-1", "succeeded", {}),
      (error: Error) =>
        /no completion was verified/.test(error.message) &&
        !error.message.includes("sensitive internal detail"),
    );
  });
}
