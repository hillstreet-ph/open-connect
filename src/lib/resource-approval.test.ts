import test from "node:test";
import assert from "node:assert/strict";
import {
  canDownloadResource,
  isResourceApproved,
  mergedReviewConfig,
  hasResourceReviewEvidence,
  isResourceExecutable,
} from "./resource-approval.ts";
import { reviewedResourceFixture } from "./resource-review.fixture.ts";

test("execution requires explicit authorization and independent version-bound reviews", () => {
  const approved = {
    ...reviewedResourceFixture(),
    verified: true,
    owner_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  };
  assert.equal(isResourceExecutable(approved), true);
  assert.equal(
    isResourceExecutable({ verified: true, installation_config: { review_state: "approved" } }),
    false,
  );
  for (const executable of [undefined, null, false, "true", 1]) {
    assert.equal(
      isResourceExecutable({
        ...approved,
        installation_config: { ...approved.installation_config, executable },
      }),
      false,
    );
  }
  for (const field of ["security_review", "license_review"] as const) {
    for (const patch of [
      { state: "pending" },
      { version: "old-version" },
      { content_sha256: "b".repeat(64) },
      { reviewer_id: approved.owner_id },
      { reviewer_id: approved.owner_id.toUpperCase() },
      { reviewer_id: "" },
      { reviewed_at: "not-a-date" },
      { evidence_url: "" },
      { evidence_url: "javascript:alert(1)" },
    ]) {
      const config = approved.installation_config;
      assert.equal(
        hasResourceReviewEvidence({
          ...approved,
          installation_config: { ...config, [field]: { ...config[field], ...patch } },
        }),
        false,
      );
    }
  }
  assert.equal(hasResourceReviewEvidence({ ...approved, version: "2.0.0" }), false);
  assert.equal(
    hasResourceReviewEvidence({
      ...approved,
      installation_config: { ...approved.installation_config, scan_report: { state: "blocked" } },
    }),
    false,
  );
});

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
