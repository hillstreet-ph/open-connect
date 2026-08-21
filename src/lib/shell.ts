/** Authenticated product routes — app chrome, not marketing site. */
export const APP_ROUTE_PREFIXES = [
  "/dashboard",
  "/settings",
  "/api-keys",
  "/agents",
  "/toolkits",
] as const;

/** True when pathname is inside the signed-in product workspace. */
export function isAppPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return APP_ROUTE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

/** Marketing / public site paths (anyone can view). */
export function isPublicMarketingPath(pathname: string): boolean {
  return !isAppPath(pathname);
}
