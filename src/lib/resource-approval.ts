export type ReviewableResource = {
  verified?: boolean;
  published?: boolean;
  owner_id?: string | null;
  version?: string | null;
  installation_config?: unknown;
};

export function resourceConfig(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function resourceReviewState(resource: ReviewableResource): string {
  const state = resourceConfig(resource.installation_config)["review_state"];
  return typeof state === "string" ? state : "pending_security_review";
}

export function isResourceApproved(resource: ReviewableResource): boolean {
  return resource.verified === true && resourceReviewState(resource) === "approved";
}

/** Independent reviews bind their decision to the exact package bytes and version.
 * Static scans and an "approved" display label are not independent review evidence.
 */
export function hasResourceReviewEvidence(resource: ReviewableResource): boolean {
  const config = resourceConfig(resource.installation_config);
  const digest = config["content_sha256"];
  if (typeof digest !== "string" || !/^[a-f0-9]{64}$/i.test(digest) || !resource.version)
    return false;
  if (resourceConfig(config["scan_report"])["state"] === "blocked") return false;
  return ["security_review", "license_review"].every((field) => {
    const review = resourceConfig(config[field]);
    const reviewer = review["reviewer_id"];
    const reviewedAt = review["reviewed_at"];
    const reference = review["evidence_url"];
    return (
      review["state"] === "approved" &&
      review["version"] === resource.version &&
      review["content_sha256"] === digest &&
      typeof reviewer === "string" &&
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(reviewer) &&
      reviewer.toLowerCase() !== resource.owner_id?.toLowerCase() &&
      typeof reviewedAt === "string" &&
      /^\d{4}-\d{2}-\d{2}T/.test(reviewedAt) &&
      Number.isFinite(Date.parse(reviewedAt)) &&
      typeof reference === "string" &&
      validEvidenceUrl(reference)
    );
  });
}

function validEvidenceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

/** Catalog visibility/download approval does not authorize executing a resource. */
export function isResourceExecutable(resource: ReviewableResource): boolean {
  return (
    isResourceApproved(resource) &&
    resourceConfig(resource.installation_config)["executable"] === true &&
    hasResourceReviewEvidence(resource)
  );
}

/** The package compatibility exception is supplied only after registry/hash validation. */
export function canDownloadResource(
  resource: ReviewableResource,
  userId: string,
  reviewedMigratedPackage = false,
): boolean {
  if (resource.owner_id === userId) return true;
  if (!resource.published || !resource.verified) return false;
  if (isResourceApproved(resource)) return true;
  return (
    reviewedMigratedPackage &&
    !Object.hasOwn(resourceConfig(resource.installation_config), "review_state")
  );
}

export function mergedReviewConfig(resource: ReviewableResource, action: string) {
  const config = resourceConfig(resource.installation_config);
  if (action === "verify" || action === "verify_publish")
    return { ...config, review_state: "approved" };
  if (action === "unverify") return { ...config, review_state: "pending_security_review" };
  return config;
}
