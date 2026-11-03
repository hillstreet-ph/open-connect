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

export const SIDEBAR_WIDTH_COOKIE_NAME = "sidebar_width";
export const SIDEBAR_WIDTH_MIN_REM = 12;
export const SIDEBAR_WIDTH_MAX_REM = 24;
export const SIDEBAR_WIDTH_DEFAULT_REM = 16;

/** Persists the sidebar width in rem for a week. */
export function writeSidebarWidth(widthRem: number): void {
  if (typeof document === "undefined") return;
  const clamped = Math.min(SIDEBAR_WIDTH_MAX_REM, Math.max(SIDEBAR_WIDTH_MIN_REM, widthRem));
  document.cookie = `${SIDEBAR_WIDTH_COOKIE_NAME}=${clamped}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
}

/** Restores the saved sidebar width in rem, clamped to the supported range. */
export function sidebarWidthRem(fallback = SIDEBAR_WIDTH_DEFAULT_REM): number {
  if (typeof document === "undefined") return fallback;
  const match = document.cookie.match(
    new RegExp("(?:^|; )" + SIDEBAR_WIDTH_COOKIE_NAME + "=([^;]*)"),
  );
  if (!match) return fallback;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(SIDEBAR_WIDTH_MAX_REM, Math.max(SIDEBAR_WIDTH_MIN_REM, parsed));
}
