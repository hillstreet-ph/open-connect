/**
 * Automatic Composio synchronization.
 *
 * Composio is the manager of hosted connectors: users authorize apps in
 * Composio (through the in-app hosted sign-in or the Composio dashboard) and
 * Open-Connect imports their ACTIVE broker accounts automatically. The manual
 * admin sync remains available for explicit, organization-wide reconciliation.
 */

/** One automatic pass per user per interval keeps broker usage bounded. */
export const AUTO_SYNC_MIN_INTERVAL_MS = 5 * 60_000;

const lastAutoSyncByUser = new Map<string, number>();

/**
 * Returns whether an automatic pass is due for this user, and reserves the
 * slot immediately so concurrent listings cannot double-sync.
 */
export function autoSyncDue(userId: string, now: number = Date.now()): boolean {
  const key = userId.trim();
  if (!key) return false;
  const last = lastAutoSyncByUser.get(key) ?? 0;
  if (now - last < AUTO_SYNC_MIN_INTERVAL_MS) return false;
  lastAutoSyncByUser.set(key, now);
  return true;
}

/** Test-only reset of the in-memory throttle. */
export function resetAutoSyncThrottle() {
  lastAutoSyncByUser.clear();
}

/**
 * Merge the curated catalog with Composio toolkit labels. Curated entries win
 * so gateway and connector cards keep their reviewed display names.
 */
export function buildSyncCatalog(
  curated: ReadonlyArray<{ provider: string; display_name: string }>,
  toolkits: ReadonlyArray<{ slug: string; name: string }>,
): Array<{ slug: string; name: string }> {
  const catalog = new Map<string, string>();
  for (const toolkit of toolkits) {
    if (toolkit.slug) catalog.set(toolkit.slug.toLowerCase(), toolkit.name);
  }
  for (const item of curated) {
    if (item.provider) catalog.set(item.provider.toLowerCase(), item.display_name);
  }
  return [...catalog].map(([slug, name]) => ({ slug, name }));
}
