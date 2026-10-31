/**
 * Sidebar collapsed/expanded persistence.
 *
 * The sidebar provider writes this cookie on every toggle; reading it back keeps
 * the user's choice across reloads and between the workspace and public shells.
 */

export const SIDEBAR_COOKIE_NAME = "sidebar_state";
export const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

/** Persists the sidebar state for a week. */
export function writeSidebarOpen(open: boolean): void {
  if (typeof document === "undefined") return;
  document.cookie = `${SIDEBAR_COOKIE_NAME}=${open}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
}

/** Restores the last expanded/collapsed choice, defaulting to expanded. */
export function sidebarDefaultOpen(fallback = true): boolean {
  if (typeof document === "undefined") return fallback;
  const match = document.cookie.match(new RegExp("(?:^|; )" + SIDEBAR_COOKIE_NAME + "=([^;]*)"));
  if (!match) return fallback;
  return match[1] === "true";
}
