import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_BULK_LIBRARY, normalizeLibraryBulkInput, planCollectionAdd } from "./library-bulk.ts";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

test("normalizes, de-duplicates and validates bulk library input", () => {
  assert.deepEqual(normalizeLibraryBulkInput({ resourceIds: [A, A.toUpperCase(), B] }), {
    resourceIds: [A, B],
    collectionId: null,
  });
  assert.equal(normalizeLibraryBulkInput({ resourceIds: [A], collectionId: C }).collectionId, C);
  assert.equal(
    normalizeLibraryBulkInput({ resourceIds: [A], collectionId: "" }).collectionId,
    null,
  );
  assert.throws(() => normalizeLibraryBulkInput({ resourceIds: [] }), /at least one/);
  assert.throws(() => normalizeLibraryBulkInput({ resourceIds: ["x"] }), /Invalid resource/);
  assert.throws(
    () => normalizeLibraryBulkInput({ resourceIds: [A], collectionId: "bad" }),
    /Invalid collection/,
  );
  const many = Array.from(
    { length: MAX_BULK_LIBRARY + 1 },
    (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
  );
  assert.throws(() => normalizeLibraryBulkInput({ resourceIds: many }), /at most/);
});

test("collection add respects the item limit and skips existing items", () => {
  assert.deepEqual(planCollectionAdd([A, B, C], [A], 2), { add: [B], overflow: [C] });
  assert.deepEqual(planCollectionAdd([A, B], [], 100), { add: [A, B], overflow: [] });
  assert.deepEqual(planCollectionAdd([B], [A, C], 2), { add: [], overflow: [B] });
});
