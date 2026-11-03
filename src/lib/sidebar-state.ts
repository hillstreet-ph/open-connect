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
export const SIDEBAR_WIDTH_DEFAULT = 256;
export const SIDEBAR_WIDTH_MIN = 200;
export const SIDEBAR_WIDTH_MAX = 420;

/** Clamps a dragged sidebar width to the supported range. */
export function clampSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) return SIDEBAR_WIDTH_DEFAULT;
  return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, Math.round(width)));
}

/** Persists the user's dragged sidebar width for a week. */
export function writeSidebarWidth(width: number): void {
  if (typeof document === "undefined") return;
  document.cookie = `${SIDEBAR_WIDTH_COOKIE_NAME}=${clampSidebarWidth(width)}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
}

/** Restores the last dragged width, defaulting to 16rem. */
export function sidebarDefaultWidth(): number {
  if (typeof document === "undefined") return SIDEBAR_WIDTH_DEFAULT;
  const match = document.cookie.match(
    new RegExp("(?:^|; )" + SIDEBAR_WIDTH_COOKIE_NAME + "=([^;]*)"),
  );
  if (!match) return SIDEBAR_WIDTH_DEFAULT;
  return clampSidebarWidth(Number(match[1]));
}