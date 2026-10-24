export type ReviewableResource = {
  verified?: boolean;
  published?: boolean;
  owner_id?: string | null;
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
