import test from "node:test";
import assert from "node:assert/strict";
import {
  canDownloadResource,
  isResourceApproved,
  mergedReviewConfig,
} from "./resource-approval.ts";

test("public approval requires verification and an explicit approved state", () => {
  for (const installation_config of [
    undefined,
    null,
    [],
    {},
    { review_state: "pending_security_review" },
    { review_state: "quarantined_metadata" },
  ]) {
    const r = { verified: true, published: true, installation_config };
    assert.equal(isResourceApproved(r), false);
    assert.equal(canDownloadResource(r, "visitor"), false);
  }
  assert.equal(
    canDownloadResource(
      { verified: true, published: true, installation_config: { review_state: "approved" } },
      "visitor",
    ),
    true,
  );
  assert.equal(
    isResourceApproved({ verified: false, installation_config: { review_state: "approved" } }),
    false,
  );
});

test("owners keep access to their own private uploads", () => {
  assert.equal(
    canDownloadResource({ owner_id: "owner", verified: false, published: false }, "owner"),
    true,
  );
  assert.equal(
    canDownloadResource({ owner_id: "owner", verified: false, published: false }, "visitor"),
    false,
  );
});

test("reviewed legacy compatibility never overrides explicit blocked states", () => {
  const r = { verified: true, published: true };
  assert.equal(canDownloadResource(r, "visitor", true), true);
  for (const state of ["pending_security_review", "quarantined_metadata", null, false])
    assert.equal(
      canDownloadResource({ ...r, installation_config: { review_state: state } }, "visitor", true),
      false,
    );
  assert.equal(canDownloadResource({ ...r, verified: false }, "visitor", true), false);
});

test("review decisions preserve unrelated configuration and publishing does not approve", () => {
  const r = {
    installation_config: {
      endpoint: "https://example.com/mcp",
      review_state: "quarantined_metadata",
    },
  };
  assert.deepEqual(mergedReviewConfig(r, "verify"), {
    endpoint: "https://example.com/mcp",
    review_state: "approved",
  });
  assert.equal(mergedReviewConfig(r, "publish")["review_state"], "quarantined_metadata");
  assert.equal(mergedReviewConfig(r, "unverify")["review_state"], "pending_security_review");
});
