import { isAppPath } from "./shell.ts";

const unsafePath = (value: string) =>
  [...value].some(
    (char) => char === "\\" || char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127,
  );

/** Keep sign-in destinations on recognized pages of this site. */
export function safeAuthReturn(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    unsafePath(value)
  )
    return "/dashboard";
  try {
    const url = new URL(value, "https://open-connect.local");
    const path = decodeURIComponent(url.pathname);
    if (url.origin !== "https://open-connect.local" || unsafePath(path) || path.startsWith("//"))
      return "/dashboard";
    if (path !== "/" && path !== "/oauth/authorize" && !isAppPath(path)) return "/dashboard";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/dashboard";
  }
}
