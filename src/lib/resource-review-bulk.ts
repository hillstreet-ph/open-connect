import { isResourceApproved, resourceReviewState } from "./resource-approval.ts";
export const REVIEW_ACTIONS = [
  "verify",
  "unverify",
  "publish",
  "unpublish",
  "verify_publish",
] as const;

export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

export const MAX_BULK_REVIEW = 1000;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isReviewAction(value: unknown): value is ReviewAction {
  return typeof value === "string" && (REVIEW_ACTIONS as readonly string[]).includes(value);
}

/** Validates and de-duplicates a bulk review request. Throws on bad input. */
export function normalizeBulkReviewInput(input: unknown): { ids: string[]; action: ReviewAction } {
  const raw = (input ?? {}) as { ids?: unknown; action?: unknown };
  const action = typeof raw.action === "string" ? raw.action.trim() : "";
  if (!isReviewAction(action)) throw new Error("Choose a valid resource review action");
  if (!Array.isArray(raw.ids)) throw new Error("Select at least one resource");
  const ids = [
    ...new Set(raw.ids.map((id) => (typeof id === "string" ? id.trim().toLowerCase() : ""))),
  ];
  if (!ids.length) throw new Error("Select at least one resource");
  if (ids.length > MAX_BULK_REVIEW) {
    throw new Error(`Select at most ${MAX_BULK_REVIEW} resources at a time`);
  }
  if (ids.some((id) => !UUID_PATTERN.test(id))) throw new Error("Invalid resource id");
  return { ids, action };
}

/** Column changes for an action. Unverifying always unpublishes. */
export function reviewUpdate(action: ReviewAction): { verified?: boolean; published?: boolean } {
  switch (action) {
    case "verify":
      return { verified: true };
    case "unverify":
      return { verified: false, published: false };
    case "publish":
      return { published: true };
    case "unpublish":
      return { published: false };
    case "verify_publish":
      return { verified: true, published: true };
  }
}

/**
 * Splits selected resources into the ones the action applies to and the ones
 * skipped. "publish" never publishes an unverified resource; rows already in
 * the target state are skipped so the count reflects real changes.
 */
export function planBulkReview<
  T extends { id: string; verified: boolean; published: boolean; installation_config?: unknown },
>(
  resources: T[],
  action: ReviewAction,
): { apply: string[]; skipped: { id: string; reason: string }[] } {
  const apply: string[] = [];
  const skipped: { id: string; reason: string }[] = [];
  for (const resource of resources) {
    if (
      ["verify", "publish", "verify_publish"].includes(action) &&
      (resource.installation_config as { scan_report?: { state?: string } } | null)?.scan_report
        ?.state === "blocked"
    ) {
      skipped.push({ id: resource.id, reason: "scan_blocked" });
      continue;
    }
    if (action === "publish" && !isResourceApproved(resource)) {
      skipped.push({ id: resource.id, reason: "not_verified" });
      continue;
    }
    const target = reviewUpdate(action);
    const unchanged =
      (target.verified === undefined || target.verified === resource.verified) &&
      (target.published === undefined || target.published === resource.published) &&
      (!(action === "verify" || action === "verify_publish") ||
        resourceReviewState(resource) === "approved") &&
      (action !== "unverify" || resourceReviewState(resource) === "pending_security_review");
    if (unchanged) {
      skipped.push({ id: resource.id, reason: "already_done" });
      continue;
    }
    apply.push(resource.id);
  }
  return { apply, skipped };
}

export function reviewActionLabel(action: ReviewAction): string {
  switch (action) {
    case "verify":
      return "Verify";
    case "unverify":
      return "Remove verification";
    case "publish":
      return "Publish";
    case "unpublish":
      return "Unpublish";
    case "verify_publish":
      return "Verify & publish";
  }
}
