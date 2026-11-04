import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { writeResourceReview } from "./resource-review-store.ts";
import { reviewedResourceFixture } from "./resource-review.fixture.ts";

test("review writes preserve config and match both identity and version", async () => {
  const predicates: unknown[] = [];
  let update: Record<string, unknown> = {};
  const chain = {
    from: () => chain,
    update: (value: Record<string, unknown>) => {
      update = value;
      return chain;
    },
    eq: (key: string, value: unknown) => {
      predicates.push([key, value]);
      return chain;
    },
    select: () => chain,
    maybeSingle: async () => ({ data: { id: "one" }, error: null }),
  };
  await writeResourceReview(
    chain as unknown as SupabaseClient,
    {
      id: "one",
      verified: false,
      published: false,
      updated_at: "old-version",
      ...reviewedResourceFixture(),
      installation_config: {
        ...reviewedResourceFixture().installation_config,
        endpoint: "https://example.com",
        review_state: "pending_security_review",
      },
    },
    "verify",
    "new-version",
  );
  assert.deepEqual(predicates, [
    ["id", "one"],
    ["updated_at", "old-version"],
  ]);
  assert.deepEqual(update["installation_config"], {
    ...reviewedResourceFixture().installation_config,
    endpoint: "https://example.com",
    review_state: "approved",
  });
  assert.equal(update["verified"], true);
});

test("concurrent changes produce a conflict result without a stale retry", async () => {
  let calls = 0;
  const chain = {
    from: () => chain,
    update: () => chain,
    eq: () => chain,
    select: () => chain,
    maybeSingle: async () => {
      calls++;
      return { data: null, error: null };
    },
  };
  const result = await writeResourceReview(
    chain as unknown as SupabaseClient,
    {
      id: "one",
      verified: true,
      published: true,
      ...reviewedResourceFixture(),
      updated_at: "stale",
    },
    "verify_publish",
    "now",
  );
  assert.equal(result, null);
  assert.equal(calls, 1);
});

test("missing or stale independent evidence prevents writes, including bulk promotion actions", async () => {
  const client = {
    from: () => {
      throw new Error("must not write");
    },
  } as unknown as SupabaseClient;
  for (const action of ["verify", "publish", "verify_publish"] as const) {
    await assert.rejects(
      writeResourceReview(
        client,
        {
          id: "one",
          verified: true,
          published: false,
          updated_at: "revision",
          installation_config: { review_state: "approved" },
        },
        action,
        "now",
      ),
      /Independent security and license review evidence/,
    );
  }
});
