import { flatAppNav } from "./nav.ts";

/** Parent route used when the tab has no in-app history (e.g. opened by an AI client). */
export function backFallback(pathname: string, inApp: boolean): string {
  if (!inApp) return "/";
  const parent = flatAppNav().find(
    (item) => item.to !== pathname && pathname.startsWith(item.to + "/"),
  );
  return parent?.to ?? "/dashboard";
}
