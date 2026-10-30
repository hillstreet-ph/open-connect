/** Authenticated product routes — app chrome, not marketing site. */
export const APP_ROUTE_PREFIXES = [
  "/dashboard",
  "/settings",
  "/api-keys",
  "/agents",
  "/ai-agency",
  "/toolkits",
  "/admin",
  "/secrets",
  "/guides",
  "/studio",
  "/orgs",
  "/roles",
  "/projects",
  "/project-access",
  "/custom-oauth-callback",
  "/tasks",
  "/schedule",
  "/automations",
  "/library",
  "/resources",
  "/plugins",
  "/skills",
  "/mcp-servers",
  "/tools",
  "/prompts",
  "/memory",
  "/knowledge",
  "/others",
  "/cloud",
  "/cloud-sandbox",
  "/cloud-phone",
  "/cloud-browser",
  "/cloud-terminal",
  "/cloud-computer",
  "/connections",
  "/models",
  "/integrations",
  "/campaign-studio",
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

/** A matched authenticated layout owns its chrome, including while auth state hydrates. */
export function usesWorkspaceChrome(
  pathname: string,
  signedIn: boolean,
  matchedPrivateRoute: boolean,
) {
  return matchedPrivateRoute || (signedIn && isAppPath(pathname));
}
