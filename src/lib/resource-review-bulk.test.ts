import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_BULK_REVIEW,
  normalizeBulkReviewInput,
  planBulkReview,
  reviewUpdate,
} from "./resource-review-bulk.ts";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

test("normalizes, de-duplicates and validates bulk input", () => {
  assert.deepEqual(
    normalizeBulkReviewInput({ ids: [A, ` ${A.toUpperCase()} `, B], action: "verify" }),
    {
      ids: [A, B],
      action: "verify",
    },
  );
  assert.throws(() => normalizeBulkReviewInput({ ids: [A], action: "delete" }), /valid/);
  assert.throws(() => normalizeBulkReviewInput({ ids: [], action: "verify" }), /at least one/);
  assert.throws(() => normalizeBulkReviewInput({ ids: "x", action: "verify" }), /at least one/);
  assert.throws(() => normalizeBulkReviewInput({ ids: ["1 or 1=1"], action: "verify" }), /Invalid/);
  const many = Array.from(
    { length: MAX_BULK_REVIEW + 1 },
    (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
  );
  assert.throws(() => normalizeBulkReviewInput({ ids: many, action: "verify" }), /at most/);
});

test("unverify always unpublishes; verify_publish sets both", () => {
  assert.deepEqual(reviewUpdate("unverify"), { verified: false, published: false });
  assert.deepEqual(reviewUpdate("verify_publish"), { verified: true, published: true });
});

test("publish skips unverified resources and no-ops", () => {
  const rows = [
    { id: A, verified: false, published: false },
    { id: B, verified: true, published: false, installation_config: { review_state: "approved" } },
    { id: C, verified: true, published: true, installation_config: { review_state: "approved" } },
  ];
  assert.deepEqual(planBulkReview(rows, "publish"), {
    apply: [B],
    skipped: [
      { id: A, reason: "not_verified" },
      { id: C, reason: "already_done" },
    ],
  });
  assert.deepEqual(planBulkReview(rows, "verify_publish").apply, [A, B]);
  assert.deepEqual(planBulkReview(rows, "verify").apply, [A]);
  assert.deepEqual(planBulkReview(rows, "unpublish").apply, [C]);
});

test("verified but pending rows need explicit approval; publish cannot approve", () => {
  const rows = [{ id: A, verified: true, published: false }];
  assert.deepEqual(planBulkReview(rows, "verify").apply, [A]);
  assert.deepEqual(planBulkReview(rows, "publish").apply, []);
});
