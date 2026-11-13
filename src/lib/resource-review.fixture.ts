/** Synthetic review evidence for permission regression tests; never persisted. */
export function reviewedResourceFixture() {
  const review = {
    state: "approved",
    version: "1.0.0",
    content_sha256: "a".repeat(64),
    reviewer_id: "22222222-2222-4222-8222-222222222222",
    reviewed_at: "2026-10-01T00:00:00.000Z",
    evidence_url: "https://review.example/immutable-review/1",
  };
  return {
    version: "1.0.0",
    owner_id: "11111111-1111-4111-8111-111111111111",
    installation_config: {
      review_state: "approved",
      executable: true,
      content_sha256: review.content_sha256,
      security_review: { ...review },
      license_review: { ...review },
    },
  };
}
